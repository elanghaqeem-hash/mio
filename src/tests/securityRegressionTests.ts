import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isBlockedAddress, parseHttpsUrl } from '../../electron/ipc/browserReadSandbox';
import { WorkspaceSandbox } from '../../electron/ipc/workspaceSandbox';
import { onRequestPost as generatePost } from '../../functions/api/ai/generate';
import { onRequestPost as researchPost } from '../../functions/api/research';
import { readBoundedJson, redactSecretText as redactFunctionSecretText } from '../../functions/api/_security';
import { ModelRouter } from '../agents/ModelRouter';
import { emergencyStop } from '../core/EmergencyStop';
import { eventBus } from '../core/EventBus';
import { buildDesktopBrowserScope, createDesktopBrowserGateway } from '../platform/desktop/DesktopBrowserGateway';
import { PermissionEngine } from '../security/PermissionEngine';
import { assertNoSecretFields, isSecretKey, redactSecretText } from '../security/SecretRedaction';
import { SecurityAuditLog } from '../security/SecurityAuditLog';
import { mioChatVoice } from '../services/voice/MioChatVoiceController';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { ModelProvider, ModelRequest } from '../types/models';
import type { DryRunRequest, SecurityEvent } from '../types/security';

const assert = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const rejects = async (run: () => Promise<unknown>, pattern: RegExp): Promise<boolean> => {
  try { await run(); return false; } catch (error) { return pattern.test(error instanceof Error ? error.message : String(error)); }
};
const streamOf = (chunks: number, chunkBytes: number) => new ReadableStream<Uint8Array>({
  pull(controller) { if (chunks-- <= 0) controller.close(); else controller.enqueue(new Uint8Array(chunkBytes).fill(0x20)); },
});

// MIO-PRV-06.02/06.03/06.04: threat cases that the earlier suites did not cover. Each case failed (or had no
// enforcement at all) before the fix it guards.
export async function runSecurityRegressionTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => Promise<void> | void]> = [
    ['path traversal: a symlinked directory cannot carry a workspace mutation outside the root', async () => {
      const base = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mio-prv06-'));
      const root = path.join(base, 'root');
      const outside = path.join(base, 'outside');
      await fs.promises.mkdir(root);
      await fs.promises.mkdir(outside);
      await fs.promises.writeFile(path.join(root, 'a.txt'), 'inside');
      await fs.promises.symlink(outside, path.join(root, 'escape-link'), 'dir');
      try {
        const sandbox = new WorkspaceSandbox();
        const workspace = await sandbox.authorizeRoot(root);
        for (const operation of [
          { kind: 'MKDIR', target: 'escape-link/created' },
          { kind: 'COPY', source: 'a.txt', target: 'escape-link/copied.txt' },
          { kind: 'MOVE', source: 'a.txt', target: 'escape-link/moved.txt' },
          { kind: 'RENAME', source: 'a.txt', target: '../outside/renamed.txt' },
        ] as const) {
          assert(await rejects(() => sandbox.mutate(workspace.id, operation), /escapes authorized workspace/), `${operation.kind} through a symlink was not blocked`);
        }
        assert((await fs.promises.readdir(outside)).length === 0, 'a mutation wrote outside the authorized workspace');
        await sandbox.mutate(workspace.id, { kind: 'MKDIR', target: 'inside-dir' });
        await sandbox.mutate(workspace.id, { kind: 'COPY', source: 'a.txt', target: 'inside-dir/a-copy.txt' });
        assert(fs.existsSync(path.join(root, 'inside-dir', 'a-copy.txt')), 'a legitimate in-workspace mutation was blocked');
      } finally {
        await fs.promises.rm(base, { recursive: true, force: true });
      }
    }],
    ['SSRF: private, reserved, and IPv4-embedding IPv6 addresses are blocked; public ones are not', () => {
      const blocked = ['127.0.0.1', '169.254.169.254', '10.1.2.3', '100.64.0.1', '198.18.0.1', '192.0.0.8', '0.0.0.0', '::', '::1', '[::1]',
        '::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '::ffff:7f00:1', '::ffff:0.0.0.0', '::127.0.0.1', '64:ff9b::a9fe:a9fe',
        '2002:7f00:1::', '2001:0:4136:e378::1', '2001:db8::1', 'fec0::1', 'fe80::1%eth0', 'fd12::1', 'ff02::1', 'not-an-ip', '1:2:3:4:5:6:7:8:9'];
      const allowed = ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1'];
      const missed = blocked.filter(address => !isBlockedAddress(address));
      const wrong = allowed.filter(address => isBlockedAddress(address));
      assert(missed.length === 0, `not blocked: ${missed.join(', ')}`);
      assert(wrong.length === 0, `public address blocked: ${wrong.join(', ')}`);
    }],
    ['SSRF: localhost spellings and numeric loopback hosts never reach a public fetch', () => {
      for (const url of ['https://localhost./', 'https://LOCALHOST../', 'https://intranet.internal./', 'http://example.com/', 'https://user:pw@example.com/']) {
        let rejected = false;
        try { parseHttpsUrl(url); } catch { rejected = true; }
        assert(rejected, `${url} was accepted`);
      }
      for (const url of ['https://0x7f000001/', 'https://2130706433/', 'https://127.1/', 'https://[::ffff:127.0.0.1]/']) {
        assert(isBlockedAddress(parseHttpsUrl(url).hostname), `${url} resolved to an unblocked host`);
      }
    }],
    ['SSRF: content from a cross-origin redirect never reaches the model after approving one origin', async () => {
      PermissionEngine.clearForTests();
      const stopApprovals = eventBus.on<DryRunRequest>('REQUEST_DRY_RUN_PERMISSION', request => request.onApprove());
      try {
        const gateway = createDesktopBrowserGateway({ browserReadPage: async () => ({ success: true, title: 'Metadata', url: 'https://attacker.example/landing', text: 'other origin', truncated: false }) });
        const result = await gateway.execute('service.desktop.browser.read-page', { url: 'https://example.com/page' }, { taskId: 'prv06_redirect', projectId: 'p1', mode: 'RESEARCH', requestedBy: 'AGENT', ...buildDesktopBrowserScope('https://example.com/page') });
        assert(!result.success && /outside the approved origin/.test(result.error ?? ''), `cross-origin redirect accepted: ${result.error ?? 'success'}`);
      } finally {
        stopApprovals();
        PermissionEngine.clearForTests();
      }
    }],
    ['secret exposure: camelCase, SCREAMING_CASE, and kebab-case credential keys are recognised', () => {
      const secretKeys = ['apiKey', 'OPENAI_API_KEY', 'api_keys', 'accessToken', 'refresh_token', 'clientSecret', 'privateKey', 'passwd', 'cookie', 'x-goog-api-key', 'Authorization', 'credentials'];
      const ordinaryKeys = ['inputTokens', 'outputTokens', 'maxOutputTokens', 'tokenizer', 'secretary', 'keyboard', 'monkey', 'sessionId', 'description'];
      assert(secretKeys.every(isSecretKey), `missed: ${secretKeys.filter(key => !isSecretKey(key)).join(', ')}`);
      assert(!ordinaryKeys.some(isSecretKey), `false positive: ${ordinaryKeys.filter(isSecretKey).join(', ')}`);
      let rejected = false;
      try { assertNoSecretFields({ usage: { inputTokens: 1 }, provider: { accessToken: 'x' } }); } catch { rejected = true; }
      assert(rejected, 'a nested camelCase credential passed the no-secrets contract');
    }],
    ['secret exposure: credential values are redacted from text, identically in the app and in Pages Functions', () => {
      const leaks = ['sk-proj-abcdefghijklmnopqrstuv', 'AIzaSyA1234567890abcdefghijkl', 'eyJhbGciOiJI.eyJzdWIiOiIx.SflKxwRJSMeKKF2QT4', 'hunter2secret', 'zzz123'];
      const text = `Incorrect API key provided: ${leaks[0]}. key=${leaks[1]} jwt ${leaks[2]} password=${leaks[3]}&ok=1 x-api-key: ${leaks[4]} bearer abc.def`;
      const redacted = redactSecretText(text);
      assert(leaks.every(leak => !redacted.includes(leak)) && !/bearer abc/i.test(redacted), `secret survived redaction: ${redacted}`);
      assert(redacted.includes('&ok=1') && redacted.includes('Incorrect API key provided'), 'redaction removed ordinary text');
      assert(redactFunctionSecretText(text) === redacted, 'Pages Functions redaction diverged from the app redaction');
    }],
    ['secret exposure: an upstream error that echoes a key is redacted before it reaches the browser', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response('{"error":"Incorrect API key provided: sk-live-0123456789abcdefghij"}', { status: 401 })) as typeof fetch;
      try {
        const response = await generatePost({ request: new Request('https://mio.test/api/ai/generate', { method: 'POST', body: JSON.stringify({ provider: 'openai', model: 'gpt-test', messages: [{ role: 'user', content: 'hi' }] }) }), env: { OPENAI_API_KEY: 'sk-live-0123456789abcdefghij' } });
        const body = await response.text();
        assert(response.status === 401 && !body.includes('sk-live-0123456789abcdefghij') && body.includes('[REDACTED]'), `key echoed to the browser: ${body}`);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }],
    ['secret exposure: audit details are redacted before they are stored', async () => {
      const storage = new InMemoryStorageProvider();
      const audit = new SecurityAuditLog();
      audit.setStorageProvider(storage);
      await audit.initialize();
      eventBus.emit<SecurityEvent>('SECURITY_EVENT', { id: 'prv06_audit_secret', timestamp: 1, level: 'error', category: 'TOOL_EXECUTION', action: 'x', details: 'provider said Authorization: Bearer sk-abcdefghijklmnopqrstu', blocked: true });
      const stored = audit.getEvents().find(event => event.id === 'prv06_audit_secret');
      assert(stored && !stored.details.includes('sk-abcdefghijklmnopqrstu'), `audit stored a secret: ${stored?.details}`);
    }],
    ['resource exhaustion: oversized and unbounded chunked bodies are rejected without being buffered', async () => {
      const declared = await generatePost({ request: new Request('https://mio.test/api/ai/generate', { method: 'POST', headers: { 'content-length': String(64 * 1024 * 1024) }, body: '{}' }), env: { OPENAI_API_KEY: 'k' } });
      assert(declared.status === 413, `declared oversized generate body returned ${declared.status}`);
      let pulled = 0;
      const counting = new ReadableStream<Uint8Array>({ pull(controller) { pulled++; controller.enqueue(new Uint8Array(64 * 1024)); } });
      const chunked = await readBoundedJson(new Request('https://mio.test/x', { method: 'POST', body: counting, duplex: 'half' } as RequestInit), 256 * 1024);
      assert(!chunked.ok && chunked.status === 413 && pulled <= 6, `chunked body not cut off (status=${chunked.ok ? 200 : chunked.status}, chunks=${pulled})`);
      const research = await researchPost({ request: new Request('https://mio.test/api/research', { method: 'POST', body: streamOf(4, 16 * 1024), duplex: 'half' } as RequestInit), env: {} });
      assert(research.status === 413, `oversized research body returned ${research.status}`);
    }],
    ['cross-project leakage: a grant bound to one project, path, or resource never authorizes a broader request', () => {
      PermissionEngine.clearForTests();
      const base = { taskId: 'prv06_scope', action: 'TOOL:file.read', target: 'Project p1', networkAllowed: false };
      const grant = PermissionEngine['issueGrant']({ ...base, level: 'L2_CREATE', projectId: 'p1', path: 'docs/a.md', resourceId: 'file:a', changes: [], risks: [], expectedResult: '', maxUses: 5 }, { ...base, projectId: 'p1', path: 'docs/a.md', resourceId: 'file:a' }, 'AUTO_POLICY');
      try {
        assert(PermissionEngine.validateGrant(grant.id, { ...base, projectId: 'p1', path: 'docs/a.md', resourceId: 'file:a' }), 'exact scope was not authorized');
        assert(!PermissionEngine.validateGrant(grant.id, { ...base, path: 'docs/a.md', resourceId: 'file:a' }), 'a request without a project reused a project-bound grant');
        assert(!PermissionEngine.validateGrant(grant.id, { ...base, projectId: 'p1', resourceId: 'file:a' }), 'a request without a path reused a path-bound grant');
        assert(!PermissionEngine.validateGrant(grant.id, { ...base, projectId: 'p1', path: 'docs/a.md' }), 'a request without a resource reused a resource-bound grant');
        assert(!PermissionEngine.validateGrant(grant.id, { ...base, projectId: 'p2', path: 'docs/a.md', resourceId: 'file:a' }), 'another project reused the grant');
      } finally {
        PermissionEngine.clearForTests();
      }
    }],
    ['Emergency Stop: an in-flight model call without a task id is aborted, and new calls are refused', async () => {
      emergencyStop.reset();
      let observedAbort = false;
      const provider = {
        id: 'prv06_hanging', displayName: 'Hanging', requiresNetwork: false, requiresProxy: false,
        generate: (_request: ModelRequest, signal?: AbortSignal) => new Promise((_, reject) => signal?.addEventListener('abort', () => { observedAbort = true; reject(new Error('aborted')); })),
      } as unknown as ModelProvider;
      const call = (ModelRouter as unknown as { executeProvider: (p: ModelProvider, r: ModelRequest, t: number) => Promise<unknown> }).executeProvider(provider, { messages: [{ role: 'user', content: 'hi' }] } as ModelRequest, 10_000);
      const outcome = call.then(() => 'resolved', (error: Error) => error.message);
      emergencyStop.triggerEmergencyStop('PRV-06 test', { fromMainProcess: true });
      try {
        assert(observedAbort && await outcome === 'Model request cancelled', `model call was not cancelled by STOP (${await outcome})`);
        assert(await rejects(() => ModelRouter.generate({ messages: [{ role: 'user', content: 'hi' }] } as ModelRequest), /STOP MIO is engaged/), 'a new model call ran while STOP MIO was engaged');
        assert(await rejects(() => mioChatVoice.startListening(() => undefined), /STOP MIO is engaged/), 'voice input started while STOP MIO was engaged');
      } finally {
        emergencyStop.reset();
      }
    }],
    ['Emergency Stop: a renderer STOP reaches the desktop main process once and is audited', () => {
      const delivered: string[] = [];
      const audited: SecurityEvent[] = [];
      const globalWithDesktop = globalThis as { mioDesktop?: unknown };
      const previous = globalWithDesktop.mioDesktop;
      globalWithDesktop.mioDesktop = { triggerEmergencyStop: async (reason: string) => { delivered.push(reason); return { success: true }; } };
      const stopAudit = eventBus.on<SecurityEvent>('SECURITY_EVENT', event => { if (event.category === 'EMERGENCY_STOP') audited.push(event); });
      try {
        emergencyStop.triggerEmergencyStop('renderer STOP');
        emergencyStop.reset();
        emergencyStop.triggerEmergencyStop('tray STOP', { fromMainProcess: true });
        emergencyStop.reset();
        assert(delivered.length === 1 && delivered[0] === 'renderer STOP', `main process received ${JSON.stringify(delivered)}`);
        assert(audited.map(event => event.action).join() === 'STOP_MIO_TRIGGERED,STOP_MIO_RESET,STOP_MIO_TRIGGERED,STOP_MIO_RESET', `audit trail: ${audited.map(event => event.action).join()}`);
      } finally {
        stopAudit();
        globalWithDesktop.mioDesktop = previous;
        emergencyStop.reset();
      }
    }],
    ['audit completeness: clearing the audit log leaves a record of the clear', async () => {
      const audit = new SecurityAuditLog();
      audit.setStorageProvider(new InMemoryStorageProvider());
      await audit.initialize();
      eventBus.emit<SecurityEvent>('SECURITY_EVENT', { id: 'prv06_before_clear', timestamp: 1, level: 'info', category: 'PERMISSION', action: 'x', details: 'y', blocked: false });
      await audit.clear();
      const events = audit.getEvents();
      assert(events.length === 1 && events[0].action === 'AUDIT_LOG_CLEARED' && events[0].category === 'AUDIT', `audit clear left no trace: ${JSON.stringify(events)}`);
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log(`✓ [PASS] ${name}`); }
  return { passed, total: tests.length };
}
