import { MIO_CAPABILITY_DOMAINS, MIO_CAPABILITY_MANIFEST_VERSION, validateAgainstSchema, validateCapabilityManifest, type MioCapabilityManifest } from '../capabilities/CapabilityManifest';
import { CapabilityProtocol, type MioCapabilityExecutor } from '../capabilities/CapabilityProtocol';
import { classifyLegacyFailure, createDefaultCapabilityProtocol, NEW_CAPABILITY_MANIFESTS } from '../capabilities/defaultCapabilityProtocol';
import { MIO_CONTRACT_SCHEMA_VERSION, type MioCapabilityRequest, type MioPermission } from '../contracts/MioContracts';
import { validateMioCapabilityResult } from '../contracts/MioContractValidation';
import { emergencyStop } from '../core/EmergencyStop';
import { eventBus } from '../core/EventBus';
import { createDefaultToolRegistry } from '../orchestrator/tools/createDefaultToolRegistry';
import { ToolRouter } from '../orchestrator/tools/ToolRouter';
import { CapabilityRegistry, defaultCapabilityRegistry } from '../security/CapabilityRegistry';
import { PermissionEngine } from '../security/PermissionEngine';
import type { MioSystemMode } from '../types/core';
import type { DryRunRequest, SecurityEvent } from '../types/security';

const assert = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
let sequence = 0;

const toolRouter = new ToolRouter(createDefaultToolRegistry());
function protocolWith(executors: Partial<Record<string, MioCapabilityExecutor<any, any>>> = {}) {
  return createDefaultCapabilityProtocol({ registry: defaultCapabilityRegistry, toolRouter, executors });
}
function request(capabilityId: string, input: unknown, options: { mode?: MioSystemMode; level?: MioPermission['level']; budgetMs?: number } = {}): MioCapabilityRequest {
  const id = ++sequence;
  return {
    schemaVersion: MIO_CONTRACT_SCHEMA_VERSION,
    requestId: `prv05_req_${id}`,
    capabilityId,
    input,
    context: { taskId: `prv05_task_${id}`, traceId: `prv05_trace_${id}`, mode: options.mode ?? 'CHAT', requestedBy: 'AGENT', privacy: 'LOCAL_ONLY', projectId: 'prv05_project' },
    permission: { level: options.level ?? 'L5_DESTRUCTIVE', action: `CAPABILITY:${capabilityId}`, target: 'Project prv05_project' },
    ...(options.budgetMs !== undefined ? { budget: { maxDurationMs: options.budgetMs, maxCostUsd: 0 } } : {}),
    createdAt: Date.now(),
  };
}
const spy = () => {
  const calls: unknown[] = [];
  const executor: MioCapabilityExecutor = async (input) => { calls.push(input); return { ok: true, output: { text: 'ok', provider: 'spy' } }; };
  return { calls, executor };
};
const contractValid = (result: unknown) => {
  const check = validateMioCapabilityResult(result);
  assert(check.ok, `result breaks the core contract: ${check.ok ? '' : check.errors.join('; ')}`);
};

// MIO-PRV-05: the unified capability protocol, its manifests, and its negative paths (05.04).
export async function runCapabilityProtocolTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => void | Promise<void>]> = [
    ['every default manifest is valid, matches its registry entry, and the six required domains are covered', () => {
      const protocol = protocolWith();
      const manifests = protocol.discover();
      for (const id of ['project.inspect', 'research.search', 'creative.execute', 'service.desktop.workspace.read-text', 'service.desktop.workspace.list', ...NEW_CAPABILITY_MANIFESTS.map(manifest => manifest.id)]) {
        const manifest = protocol.manifest(id);
        assert(manifest, `${id} is not declared`);
        assert(validateCapabilityManifest(manifest!).length === 0, `${id} manifest invalid: ${validateCapabilityManifest(manifest!).join('; ')}`);
        assert(defaultCapabilityRegistry.get(id)?.permissionLevel === manifest!.permissionLevel, `${id} differs from its registry entry`);
      }
      const domains = new Set([...['project.inspect', 'research.search', 'creative.execute', 'service.desktop.workspace.read-text', ...NEW_CAPABILITY_MANIFESTS.map(manifest => manifest.id)].map(id => protocol.manifest(id)!.domain)]);
      for (const domain of ['FILES', 'RESEARCH', 'MEMORY', 'MODEL', 'CREATIVE', 'VOICE'] as const) assert(domains.has(domain), `no manifest for ${domain}`);
      assert(manifests.every(manifest => (MIO_CAPABILITY_DOMAINS as readonly string[]).includes(manifest.domain)), 'unknown domain');
    }],
    ['discovery lists only capabilities that are available and allowed in the mode', () => {
      const protocol = protocolWith();
      const chat = protocol.discover('CHAT').map(manifest => manifest.id);
      assert(['research.search', 'model.generate', 'memory.recall', 'voice.speak', 'project.inspect'].every(id => chat.includes(id)), `CHAT discovery missing capabilities: ${chat.join(', ')}`);
      assert(!chat.includes('creative.execute'), 'creative.execute discovered in CHAT');
      assert(!protocol.discover('FILES').some(manifest => manifest.id.startsWith('service.desktop.')), 'unavailable desktop services were discovered in the web runtime');
      assert(protocol.discover('3D').some(manifest => manifest.id === 'creative.execute'), 'creative.execute not discovered in 3D');
    }],
    ['an unknown capability is denied and audited', async () => {
      const audited: SecurityEvent[] = [];
      const stop = eventBus.on<SecurityEvent>('SECURITY_EVENT', event => { if (event.action === 'CAPABILITY:files.delete-everything') audited.push(event); });
      try {
        const result = await protocolWith().invoke(request('files.delete-everything', {}));
        contractValid(result);
        assert(result.status === 'DENIED' && result.error.code === 'CAPABILITY_UNAVAILABLE', `unknown capability returned ${result.status}`);
        assert(audited.length === 1 && audited[0].blocked, 'unknown capability was not audited as blocked');
      } finally { stop(); }
    }],
    ['a request that breaks the core contract is rejected before anything runs', async () => {
      const { calls, executor } = spy();
      const protocol = protocolWith({ 'model.generate': executor });
      const wrongVersion = await protocol.invoke({ ...request('model.generate', { prompt: 'hi' }), schemaVersion: 2 } as unknown as MioCapabilityRequest);
      const secretInput = await protocol.invoke(request('model.generate', { prompt: 'hi', apiKey: 'sk-should-never-travel-here' }));
      const notObject = await protocol.invoke(null as unknown as MioCapabilityRequest);
      for (const result of [wrongVersion, secretInput, notObject]) {
        contractValid(result);
        assert(result.status === 'FAILED' && result.error.code === 'VALIDATION_FAILED', `invalid request returned ${result.status}`);
      }
      assert(!JSON.stringify(secretInput).includes('sk-should-never-travel-here'), 'a secret from the request leaked into the result');
      assert(calls.length === 0, 'an invalid request reached the executor');
    }],
    ['schema violations and oversized input fail validation without reaching the executor', async () => {
      const { calls, executor } = spy();
      const protocol = protocolWith({ 'research.search': executor });
      const cases: unknown[] = [{ query: 5 }, { query: 'ok', extra: true }, { query: 'a'.repeat(1001) }, { query: '   ' }, {}, 'query', { query: 'x'.repeat(5000) }];
      for (const input of cases) {
        const result = await protocol.invoke(request('research.search', input));
        contractValid(result);
        assert(result.status === 'FAILED' && result.error.code === 'VALIDATION_FAILED' && !result.error.retryable, `input ${JSON.stringify(input).slice(0, 40)} returned ${result.status}`);
      }
      assert(calls.length === 0, 'an invalid input reached the executor');
    }],
    ['an under-declared permission, a disallowed mode, and an unavailable capability are denied', async () => {
      const { calls, executor } = spy();
      const protocol = protocolWith({ 'research.search': executor, 'service.desktop.workspace.read-text': executor });
      const underDeclared = await protocol.invoke(request('research.search', { query: 'mio' }, { level: 'L1_SUGGEST' }));
      assert(underDeclared.status === 'DENIED' && underDeclared.error.code === 'PERMISSION_DENIED', `under-declared permission returned ${underDeclared.status}`);
      const wrongMode = await protocol.invoke(request('research.search', { query: 'mio' }, { mode: '3D' }));
      assert(wrongMode.status === 'DENIED' && wrongMode.error.code === 'PERMISSION_DENIED', `disallowed mode returned ${wrongMode.status}`);
      const unavailable = await protocol.invoke(request('service.desktop.workspace.read-text', { workspaceId: 'ws_1', relativePath: 'a.txt' }, { mode: 'FILES' }));
      assert(unavailable.status === 'DENIED' && unavailable.error.code === 'CAPABILITY_UNAVAILABLE', `unavailable capability returned ${unavailable.status}`);
      assert(calls.length === 0, 'a denied request reached the executor');
    }],
    ['a user who rejects the L4 permission prompt gets a DENIED result and no research runs', async () => {
      PermissionEngine.clearForTests();
      let prompts = 0;
      const reject = eventBus.on<DryRunRequest>('REQUEST_DRY_RUN_PERMISSION', dryRun => { prompts++; dryRun.onCancel(); });
      try {
        const result = await protocolWith().invoke(request('research.search', { query: 'mio capability protocol' }, { mode: 'RESEARCH' }));
        contractValid(result);
        assert(prompts === 1 && result.status === 'DENIED' && result.error.code === 'PERMISSION_DENIED', `rejected permission returned ${result.status} (${result.status === 'SUCCEEDED' ? '' : result.error.message}, prompts=${prompts})`);
      } finally { reject(); PermissionEngine.clearForTests(); }
    }],
    ['output that breaks the manifest schema is rejected, and a failed mutating call is never retryable', async () => {
      const protocol = protocolWith({
        'model.generate': async () => ({ ok: true, output: { text: '', provider: 'spy' } }),
        'creative.execute': async () => { throw new Error('renderer crashed midway'); },
      });
      const emptyText = await protocol.invoke(request('model.generate', { prompt: 'hi' }));
      contractValid(emptyText);
      assert(emptyText.status === 'FAILED' && emptyText.error.code === 'VALIDATION_FAILED' && emptyText.error.mutationState === 'NONE', 'schema-breaking output was accepted');
      const crashed = await protocol.invoke(request('creative.execute', { prompt: 'a red cube', requestedMode: '3D' }, { mode: '3D' }));
      contractValid(crashed);
      assert(crashed.status === 'FAILED' && crashed.error.mutationState === 'UNKNOWN' && crashed.error.retryable === false, `a failed mutating call is retryable or not UNKNOWN: ${JSON.stringify(crashed.status === 'SUCCEEDED' ? {} : crashed.error)}`);
    }],
    ['a call that exceeds its budget times out, its executor is aborted, and the timeout is retryable', async () => {
      let aborted = false;
      const protocol = protocolWith({ 'model.generate': (_input, context) => new Promise(() => context.signal.addEventListener('abort', () => { aborted = true; })) });
      const result = await protocol.invoke(request('model.generate', { prompt: 'hi' }, { budgetMs: 20 }));
      contractValid(result);
      assert(result.status === 'FAILED' && result.error.code === 'TIMEOUT' && result.error.retryable && aborted, `timeout returned ${result.status}`);
    }],
    ['STOP MIO cancels an in-flight call and refuses new ones', async () => {
      emergencyStop.reset();
      let started = 0;
      const protocol = protocolWith({ 'model.generate': (_input, context) => { started++; return new Promise((resolve) => context.signal.addEventListener('abort', () => resolve({ ok: true, output: { text: 'late', provider: 'spy' } }))); } });
      const pending = protocol.invoke(request('model.generate', { prompt: 'hi' }));
      await new Promise(resolve => setTimeout(resolve, 5));
      emergencyStop.triggerEmergencyStop('PRV-05 test', { fromMainProcess: true });
      try {
        const inFlight = await pending;
        assert(inFlight.status === 'CANCELLED' && inFlight.error.code === 'CANCELLED', `in-flight call returned ${inFlight.status}`);
        const refused = await protocol.invoke(request('model.generate', { prompt: 'hi' }));
        assert(refused.status === 'CANCELLED' && started === 1, 'a new call started while STOP MIO was engaged');
      } finally { emergencyStop.reset(); }
    }],
    ['a governed call succeeds end to end and returns a contract-valid result with a capability span', async () => {
      const result = await protocolWith().invoke<{ id: string; assetCount: number }>(request('project.inspect', {}, { mode: 'PROJECT' }));
      contractValid(result);
      assert(result.status === 'SUCCEEDED' && typeof result.output.id === 'string' && result.output.assetCount >= 0, `project.inspect returned ${result.status}`);
      assert(result.trace.spans.length === 1 && result.trace.spans[0].kind === 'CAPABILITY_CALL' && result.trace.status === 'SUCCEEDED', 'trace is missing the capability span');
    }],
    ['provider error text is redacted before it reaches the result', async () => {
      const result = await protocolWith({ 'model.generate': async () => ({ ok: false, code: 'PROVIDER_FAILED', message: 'upstream said Authorization: Bearer sk-live-abcdefghijklmnopqrstu' }) }).invoke(request('model.generate', { prompt: 'hi' }));
      assert(result.status === 'FAILED' && !result.error.message.includes('sk-live-abcdefghijklmnopqrstu'), 'a credential leaked into the error');
    }],
    ['manifests that would weaken governance are rejected, and a manifest must match its registry entry', () => {
      const base = NEW_CAPABILITY_MANIFESTS.find(manifest => manifest.id === 'memory.recall')!;
      const invalid: Array<[string, Partial<MioCapabilityManifest>]> = [
        ['mutating without full audit', { mutates: true, permissionLevel: 'L2_CREATE', audit: 'ON_FAILURE' }],
        ['mutating at L1', { mutates: true, permissionLevel: 'L1_SUGGEST', audit: 'ALWAYS' }],
        ['long mutating call without cancellation', { mutates: true, permissionLevel: 'L3_MODIFY', audit: 'ALWAYS', cancellation: 'NONE', timeoutMs: 60_000 }],
        ['network access at L0', { networkAccess: true }],
        ['high risk without full audit', { riskLevel: 'HIGH' }],
        ['non-object input', { inputSchema: { type: 'string' } }],
        ['zero limit', { limits: { maxInputBytes: 0, maxOutputBytes: 10 } }],
        ['wrong version', { manifestVersion: 2 as never }],
      ];
      for (const [label, change] of invalid) assert(validateCapabilityManifest({ ...base, ...change }).length > 0, `${label} was accepted`);
      const registry = new CapabilityRegistry();
      registry.register({ id: 'memory.recall', kind: 'SERVICE', description: 'x', ownerLayer: 'SERVICE', modes: ['CHAT'], riskLevel: 'LOW', permissionLevel: 'L0_OBSERVE', availability: 'AVAILABLE', networkAccess: false, scopeFields: ['TASK'], timeoutMs: 100 });
      let mismatch = false;
      try { new CapabilityProtocol(registry).declare(base, async () => ({ ok: true, output: {} })); } catch { mismatch = true; }
      assert(mismatch, 'a manifest that differs from its registry entry was declared');
      assert(base.manifestVersion === MIO_CAPABILITY_MANIFEST_VERSION, 'default manifest version drifted');
    }],
    ['the schema validator is strict and bounded', () => {
      assert(validateAgainstSchema(1.5, { type: 'integer' }).length === 1, 'non-integer accepted');
      assert(validateAgainstSchema('c', { type: 'string', enum: ['a', 'b'] }).length === 1, 'enum not enforced');
      assert(validateAgainstSchema([1, 2, 3], { type: 'array', items: { type: 'number' }, maxItems: 2 }).length === 1, 'maxItems not enforced');
      let deep: unknown = 'leaf';
      for (let index = 0; index < 20; index++) deep = { next: deep };
      const recursive: { type: 'object'; properties: Record<string, unknown> } = { type: 'object', properties: {} };
      recursive.properties.next = recursive;
      assert(validateAgainstSchema(deep, recursive as never).some(error => error.includes('nesting')), 'unbounded nesting accepted');
      assert(classifyLegacyFailure('Permission denied or scope mismatch') === 'PERMISSION_DENIED' && classifyLegacyFailure('Resource budget blocked tool execution') === 'BUDGET_EXCEEDED', 'legacy failures misclassified');
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log(`✓ [PASS] ${name}`); }
  return { passed, total: tests.length };
}
