import { MioRecoveryCheckpointStore } from '../observability/MioRecoveryCheckpointStore';
import { captureRecoverySnapshot, reconcileRecoverySnapshot } from '../observability/MioRecoverySnapshot';
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const rejects = (call: () => unknown, message: string) => { let rejected = false; try { call(); } catch { rejected = true; } assert(rejected, message); };
const input = (actionId: string, mutates = true) => ({ projectId: 'project_A', taskId: 'task_A', actionId, idempotencyKey: 'key_' + actionId, mutates });
export function runMioRecoverySnapshotTests(): { passed: number; total: number } {
  const tests: Array<[string, () => void]> = [
    ['restart makes an executing mutation uncertain without retry', () => {
      const store = new MioRecoveryCheckpointStore();
      const id = input('write');
      store.prepare(id, 10); store.transition(id, 'EXECUTING', 20);
      const copy = reconcileRecoverySnapshot(captureRecoverySnapshot(store, 'project_A', 30), 'project_A');
      assert(copy.get(id)?.state === 'UNCERTAIN', 'restart accepted in-flight mutation as safe');
      assert(copy.decision(id) === 'MANUAL_REVIEW_REQUIRED', 'mutation was allowed to replay');
    }],
    ['restart preserves committed and prepared, and fails read-only in-flight work', () => {
      const store = new MioRecoveryCheckpointStore();
      const done = input('done'); const planned = input('planned'); const read = input('read', false);
      store.prepare(done, 1); store.transition(done, 'EXECUTING', 2); store.transition(done, 'COMMITTED', 3);
      store.prepare(planned, 4);
      store.prepare(read, 5); store.transition(read, 'EXECUTING', 6);
      const recovered = reconcileRecoverySnapshot(captureRecoverySnapshot(store, 'project_A', 10), 'project_A');
      assert(recovered.get(done)?.state === 'COMMITTED', 'commit lost');
      assert(recovered.get(planned)?.state === 'PREPARED', 'prepared action altered');
      assert(recovered.get(read)?.state === 'FAILED' && recovered.decision(read) === 'SAFE_TO_REPLAN', 'read-only interruption mishandled');
    }],
    ['project isolation, tampering and extra fields rejected before restore', () => {
      const store = new MioRecoveryCheckpointStore();
      store.prepare(input('a'), 1);
      const snapshot = captureRecoverySnapshot(store, 'project_A', 2);
      rejects(() => reconcileRecoverySnapshot(snapshot, 'project_B'), 'wrong-project restore allowed');
      rejects(() => reconcileRecoverySnapshot({ ...snapshot, checkpoints: [{ ...snapshot.checkpoints[0], projectId: 'project_B' }] }, 'project_A'), 'row scope bypass');
      rejects(() => reconcileRecoverySnapshot({ ...snapshot, secret: 'token' }, 'project_A'), 'unexpected snapshot field accepted');
      rejects(() => reconcileRecoverySnapshot({ ...snapshot, checkpoints: [{ ...snapshot.checkpoints[0], token: 'secret' }] }, 'project_A'), 'unexpected row field accepted');
    }],
    ['duplicate actions and keys are rejected, and bounded length enforced', () => {
      const store = new MioRecoveryCheckpointStore();
      store.prepare(input('a'), 1);
      const snapshot = captureRecoverySnapshot(store, 'project_A', 2);
      rejects(() => reconcileRecoverySnapshot({ ...snapshot, checkpoints: [snapshot.checkpoints[0], snapshot.checkpoints[0]] }, 'project_A'), 'duplicate checkpoint accepted');
      rejects(() => reconcileRecoverySnapshot({ ...snapshot, checkpoints: [{ ...snapshot.checkpoints[0], actionId: 'x' }, snapshot.checkpoints[0]] }, 'project_A'), 'reused idempotency key accepted');
      rejects(() => reconcileRecoverySnapshot({ ...snapshot, checkpoints: Array.from({ length: 251 }, () => snapshot.checkpoints[0]) }, 'project_A'), 'size bound missed');
    }],
    ['invalid time, schema version and corrupt state are rejected', () => {
      const store = new MioRecoveryCheckpointStore();
      store.prepare(input('a'), 10);
      const snapshot = captureRecoverySnapshot(store, 'project_A', 20);
      rejects(() => reconcileRecoverySnapshot({ ...snapshot, version: 999 }, 'project_A'), 'future version accepted');
      rejects(() => reconcileRecoverySnapshot({ ...snapshot, capturedAt: 9 }, 'project_A'), 'invalid capture time accepted');
      rejects(() => reconcileRecoverySnapshot({ ...snapshot, checkpoints: [{ ...snapshot.checkpoints[0], state: 'REPLAY' }] }, 'project_A'), 'bad state accepted');
      rejects(() => reconcileRecoverySnapshot({ ...snapshot, checkpoints: [{ ...snapshot.checkpoints[0], updatedAt: 21 }] }, 'project_A'), 'future timestamp accepted');
    }],
  ];
  let passed = 0;
  for (const [name, test] of tests) { test(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
