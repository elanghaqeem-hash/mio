import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { defaultCapabilityRegistry } from '../security/CapabilityRegistry';
import { ToolRouter } from '../orchestrator/tools/ToolRouter';
import { createDefaultToolRegistry } from '../orchestrator/tools/createDefaultToolRegistry';
import { MIO_CONTRACT_SCHEMA_VERSION, type MioCapabilityRequest } from '../contracts/MioContracts';
import { createTrustedNodeCheckpointRuntime, NodeCheckpointWriterLease } from '../observability/TrustedNodeCheckpointRuntime';
import { MioCheckpointPersistence } from '../observability/MioCheckpointPersistence';
import { NodeFileCheckpointStorage } from '../observability/NodeFileCheckpointStorage';

const assert = (condition: unknown, label: string): void => { if (!condition) throw new Error(label); };
const reject = async (fn: () => unknown | Promise<unknown>, label: string): Promise<void> => {
  let failed = false;
  try { await fn(); } catch { failed = true; }
  assert(failed, label);
};
const identity = (requestId: string) => ({ projectId: 'projectA', taskId: 'taskA', requestId, capabilityId: 'creative.execute' });
const request = (requestId: string): MioCapabilityRequest => ({
  schemaVersion: MIO_CONTRACT_SCHEMA_VERSION, requestId, capabilityId: 'creative.execute',
  context: { traceId: 'trace_' + requestId, taskId: 'taskA', projectId: 'projectA', mode: '3D', privacy: 'LOCAL_ONLY', requestedBy: 'AGENT' },
  permission: { level: 'L5_DESTRUCTIVE', action: 'CAPABILITY:creative.execute', target: 'projectA' },
  input: { prompt: 'safe cube', requestedMode: '3D' }, createdAt: Date.now(),
});
const options = (execute: () => void) => ({
  registry: defaultCapabilityRegistry,
  toolRouter: new ToolRouter(createDefaultToolRegistry()),
  executors: { 'creative.execute': async () => {
    execute();
    return { ok: true as const, output: { completed: true, outputAssetIds: [], steps: [] } };
  } },
});
export async function runTrustedNodeCheckpointRuntimeTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['exclusive writer denies a second process and permits explicit graceful release', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-lease-'));
      try {
        const first = new NodeCheckpointWriterLease(root);
        await reject(() => new NodeCheckpointWriterLease(root), 'concurrent writer admitted');
        first.close();
        const second = new NodeCheckpointWriterLease(root);
        second.close();
        await reject(() => first.assertActive(), 'closed lease remained active');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['stale lock after abrupt shutdown blocks new writer; never auto-steals', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-lease-'));
      try {
        new NodeCheckpointWriterLease(root);
        await reject(() => new NodeCheckpointWriterLease(root), 'orphan lock was silently stolen');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['trusted runtime persists actual creative mutation and blocks duplicate after reopening', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-lease-'));
      let executed = 0;
      try {
        const runtime = createTrustedNodeCheckpointRuntime(root, options(() => { executed++; }));
        const success = await runtime.protocol.invoke(request('creative_1'));
        assert(success.status === 'SUCCEEDED' && executed === 1, 'trusted runtime did not commit');
        runtime.close();
        const restarted = createTrustedNodeCheckpointRuntime(root, options(() => { executed++; }));
        const duplicate = await restarted.protocol.invoke(request('creative_1'));
        assert(duplicate.status === 'DENIED' && executed === 1, 'restart replayed creative mutation');
        restarted.close();
        const recovered = await new MioCheckpointPersistence(new NodeFileCheckpointStorage(root)).load('projectA');
        assert(recovered.get({ projectId: 'projectA', taskId: 'taskA', actionId: 'creative_1' })?.state === 'COMMITTED', 'commit missing');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['cannot release a lease with an in-flight mutation', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-lease-'));
      try {
        const runtime = createTrustedNodeCheckpointRuntime(root, options(() => {}));
        await runtime.gate.begin(identity('pending_1'));
        await reject(() => runtime.close(), 'active writer lease released');
        await runtime.gate.complete(identity('pending_1'), false);
        runtime.close();
        const next = new NodeCheckpointWriterLease(root);
        next.close();
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['tampered lock fails closed and cannot be deleted by a displaced owner', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-lease-'));
      try {
        const first = new NodeCheckpointWriterLease(root);
        const file = path.join(root, 'mio-runtime-checkpoints-v1', '.single-writer.lock');
        fs.writeFileSync(file, JSON.stringify({ version: 1, token: 'not-the-owner' }));
        await reject(() => first.close(), 'displaced owner deleted foreign lock');
        assert(fs.existsSync(file), 'foreign lock removed');
        await reject(() => new NodeCheckpointWriterLease(root), 'foreign lock was overwritten');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
