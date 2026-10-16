import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MioCheckpointPersistence } from '../observability/MioCheckpointPersistence';
import { NodeFileCheckpointStorage } from '../observability/NodeFileCheckpointStorage';
import { PersistentMutationCheckpointGate } from '../observability/PersistentMutationCheckpointGate';

const assert = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
const reject = async (call: () => unknown | Promise<unknown>, message: string): Promise<void> => {
  let denied = false;
  try { await call(); } catch { denied = true; }
  assert(denied, message);
};
export async function runNodeFileCheckpointStorageTests(): Promise<{ passed: number; total: number }> {
  const checks: Array<[string, () => Promise<void>]> = [
    ['a fresh Node adapter reloads committed state from real disk', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-node-recovery-'));
      try {
        const id = { projectId: 'project_A', taskId: 'taskA', requestId: 'callA', capabilityId: 'creative.execute' };
        const store = new NodeFileCheckpointStorage(root);
        const gate = new PersistentMutationCheckpointGate(new MioCheckpointPersistence(store));
        await gate.begin(id);
        await gate.complete(id, true);
        const second = new MioCheckpointPersistence(new NodeFileCheckpointStorage(root));
        const restored = await second.load('project_A');
        assert(restored.get({ projectId: 'project_A', taskId: 'taskA', actionId: 'callA' })?.state === 'COMMITTED', 'commit not durable');
        await reject(() => new PersistentMutationCheckpointGate(second).begin(id), 'same operation could replay on restart');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['reopening in-flight mutation after restart requires manual reconciliation', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-node-recovery-'));
      try {
        const id = { projectId: 'project_A', taskId: 'taskA', requestId: 'unfinished', capabilityId: 'creative.execute' };
        const storage = new NodeFileCheckpointStorage(root);
        await new PersistentMutationCheckpointGate(new MioCheckpointPersistence(storage)).begin(id);
        const restored = await new MioCheckpointPersistence(new NodeFileCheckpointStorage(root)).load('project_A');
        const checkpoint = { projectId: 'project_A', taskId: 'taskA', actionId: 'unfinished' };
        assert(restored.get(checkpoint)?.state === 'UNCERTAIN' && restored.decision(checkpoint) === 'MANUAL_REVIEW_REQUIRED', 'in-flight mutation replayable');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['project isolation, invalid IDs and symlink corruption fail closed', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-node-recovery-'));
      try {
        const storage = new NodeFileCheckpointStorage(root);
        await storage.atomicWrite('project_A', 'archive A');
        assert(await storage.read('project_B') === null, 'cross-project access');
        await reject(() => storage.read('../escape'), 'unsafe project accepted');
        const dir = path.join(root, 'mio-runtime-checkpoints-v1');
        const file = path.join(dir, fs.readdirSync(dir)[0]);
        fs.unlinkSync(file);
        fs.symlinkSync(path.join(root, 'target'), file);
        await reject(() => storage.read('project_A'), 'symlink followed');
        await reject(() => storage.atomicWrite('project_A', 'unsafe'), 'symlink overwritten');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['corrupted history and oversized writes are never treated as empty', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-node-recovery-'));
      try {
        const storage = new NodeFileCheckpointStorage(root);
        await storage.atomicWrite('project_A', 'corrupt checkpoint');
        await reject(() => new MioCheckpointPersistence(new NodeFileCheckpointStorage(root)).load('project_A'), 'corrupt history reset');
        await reject(() => storage.atomicWrite('project_A', 'x'.repeat(300000)), 'oversized checkpoint written');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
  ];
  let passed = 0;
  for (const [label, check] of checks) { await check(); passed++; console.log('✓ [PASS] ' + label); }
  return { passed, total: checks.length };
}
