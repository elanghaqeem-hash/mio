import { MioRecoveryCheckpointStore } from '../observability/MioRecoveryCheckpointStore';
import { MioCheckpointPersistence, recoverCheckpointArchive, serializeCheckpointArchive, type MioCheckpointStorage } from '../observability/MioCheckpointPersistence';

const assert = (x: unknown, m: string) => { if (!x) throw new Error(m); };
const reject = (fn: () => unknown, m: string) => { let threw = false; try { fn(); } catch { threw = true; } assert(threw, m); };
const id = (actionId: string, mutates = true, projectId = 'project_A') => ({
  projectId, taskId: 'task1', actionId, mutates, idempotencyKey: 'key_' + actionId,
});
export async function runMioCheckpointPersistenceTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => void | Promise<void>]> = [
    ['in-flight mutation is UNCERTAIN after restart without replay', () => {
      const store = new MioRecoveryCheckpointStore();
      const target = id('write');
      store.prepare(target, 1);
      store.transition(target, 'EXECUTING', 2);
      const recovered = recoverCheckpointArchive(serializeCheckpointArchive(store, 'project_A'), 'project_A');
      assert(recovered.get(target)?.state === 'UNCERTAIN', 'mutating execution was not quarantined');
      assert(recovered.decision(target) === 'MANUAL_REVIEW_REQUIRED', 'uncertain work was automatically replanable');
    }],
    ['read-only in-flight becomes FAILED and committed work stays committed', () => {
      const store = new MioRecoveryCheckpointStore();
      const read = id('read', false), write = id('committed');
      store.prepare(read, 1); store.transition(read, 'EXECUTING', 3);
      store.prepare(write, 1); store.transition(write, 'EXECUTING', 2); store.transition(write, 'COMMITTED', 4);
      const restored = recoverCheckpointArchive(serializeCheckpointArchive(store, 'project_A'), 'project_A');
      assert(restored.get(read)?.state === 'FAILED' && restored.decision(read) === 'SAFE_TO_REPLAN', 'read-only recovery incorrect');
      assert(restored.get(write)?.state === 'COMMITTED' && restored.decision(write) === 'NO_ACTION', 'committed action replayable');
    }],
    ['malformed, cross-project, duplicated, and secret-bearing archives fail closed', () => {
      const store = new MioRecoveryCheckpointStore();
      store.prepare(id('safe'), 1);
      const baseline = serializeCheckpointArchive(store, 'project_A');
      reject(() => recoverCheckpointArchive(baseline, 'project_B'), 'cross-project archive accepted');
      reject(() => recoverCheckpointArchive('{', 'project_A'), 'malformed JSON accepted');
      const snapshot = JSON.parse(baseline);
      snapshot.checkpoints.push({ ...snapshot.checkpoints[0] });
      reject(() => recoverCheckpointArchive(JSON.stringify(snapshot), 'project_A'), 'duplicate checkpoint accepted');
      snapshot.checkpoints.pop();
      snapshot.checkpoints[0].apiKey = 'secret';
      reject(() => recoverCheckpointArchive(JSON.stringify(snapshot), 'project_A'), 'extra secret field accepted');
      snapshot.checkpoints[0].apiKey = undefined;
      snapshot.checkpoints[0].projectId = 'project_B';
      reject(() => recoverCheckpointArchive(JSON.stringify(snapshot), 'project_A'), 'injected project accepted');
    }],
    ['state and time manipulation rejected', () => {
      const store = new MioRecoveryCheckpointStore();
      store.prepare(id('mutate'), 1);
      const snapshot = JSON.parse(serializeCheckpointArchive(store, 'project_A'));
      snapshot.checkpoints[0].state = 'UNCERTAIN';
      reject(() => recoverCheckpointArchive(JSON.stringify(snapshot), 'project_A'), 'impossible state accepted');
      snapshot.checkpoints[0].state = 'PREPARED';
      snapshot.checkpoints[0].updatedAt = 0;
      reject(() => recoverCheckpointArchive(JSON.stringify(snapshot), 'project_A'), 'invalid time accepted');
    }],
    ['injected atomic store supports round-trip and corrupted reads never reset state', async () => {
      const bytes = new Map<string, string>();
      const storage: MioCheckpointStorage = {
        read: async (projectId) => bytes.get(projectId) ?? null,
        atomicWrite: async (projectId, value) => { bytes.set(projectId, value); },
      };
      const persistence = new MioCheckpointPersistence(storage);
      const initial = await persistence.load('project_A');
      initial.prepare(id('save'), 10);
      await persistence.save('project_A', initial);
      const recovered = await persistence.load('project_A');
      assert(recovered.get(id('save'))?.state === 'PREPARED', 'round-trip failed');
      bytes.set('project_A', 'corrupt data');
      let threw = false;
      try { await persistence.load('project_A'); } catch { threw = true; }
      assert(threw, 'corrupted archive silently replaced with empty state');
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
