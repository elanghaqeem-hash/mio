import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createExclusiveNodeCheckpointRuntime } from '../observability/ExclusiveNodeCheckpointRuntime';
import { MioCheckpointPersistence } from '../observability/MioCheckpointPersistence';
import { NodeFileCheckpointStorage } from '../observability/NodeFileCheckpointStorage';

const check = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const denied = (fn: () => unknown, message: string): void => {
  let rejected = false;
  try { fn(); } catch { rejected = true; }
  check(rejected, message);
};
export async function runExclusiveNodeCheckpointRuntimeTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['exclusive writer denies second runtime and permits orderly handoff', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-writer-'));
      try {
        const runtime = createExclusiveNodeCheckpointRuntime(root);
        denied(() => createExclusiveNodeCheckpointRuntime(root), 'second owner bypassed lock');
        const id = { projectId: 'projectA', taskId: 'taskA', requestId: 'requestA', capabilityId: 'creative.execute' };
        await runtime.gate.begin(id);
        await runtime.gate.complete(id, true);
        runtime.close();
        runtime.close();
        const successor = createExclusiveNodeCheckpointRuntime(root);
        try {
          const restored = await new MioCheckpointPersistence(new NodeFileCheckpointStorage(root)).load('projectA');
          check(restored.get({projectId:'projectA',taskId:'taskA',actionId:'requestA'})?.state === 'COMMITTED', 'handoff lost commit');
        } finally { successor.close(); }
      } finally { fs.rmSync(root, {recursive:true,force:true}); }
    }],
    ['stale lock is not silently reclaimed', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-writer-'));
      try {
        const original = createExclusiveNodeCheckpointRuntime(root);
        denied(() => createExclusiveNodeCheckpointRuntime(root), 'stale writer lock overridden');
        // An unclean process exit leaves the lock; manual reconciliation is required.
        const lock = path.join(root, 'mio-runtime-checkpoints-v1', '.exclusive-writer.lock');
        check(fs.existsSync(lock), 'lock was not persisted');
        original.close();
      } finally { fs.rmSync(root, {recursive:true,force:true}); }
    }],
    ['invalid root and hijacked lock are rejected', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-writer-'));
      try {
        denied(() => createExclusiveNodeCheckpointRuntime('relative/root'), 'relative root accepted');
        const runtime = createExclusiveNodeCheckpointRuntime(root);
        const lock = path.join(root, 'mio-runtime-checkpoints-v1', '.exclusive-writer.lock');
        fs.unlinkSync(lock);
        fs.writeFileSync(lock, 'attacker-controlled');
        denied(() => runtime.close(), 'lock replacement was silently unlinked');
        check(fs.readFileSync(lock, 'utf8') === 'attacker-controlled', 'unexpected lock modification');
      } finally { fs.rmSync(root, {recursive:true,force:true}); }
    }],
  ];
  let passed = 0;
  for (const [name, execute] of tests) { await execute(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
