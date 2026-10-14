import { MioRecoveryCheckpointStore } from '../observability/MioRecoveryCheckpointStore';
const assert = (x: unknown, m: string) => { if (!x) throw new Error(m); };
const rejects = (fn: () => unknown, m: string) => { let blocked = false; try { fn(); } catch { blocked = true; } assert(blocked, m); };
const row = (actionId: string, mutates: boolean, projectId = 'project_A') => ({
  projectId, taskId: 'task_1', actionId, idempotencyKey: 'key_' + actionId, mutates,
});
export function runMioRecoveryCheckpointTests(): { passed: number; total: number } {
  const tests: Array<[string, () => void]> = [
    ['executing mutation interrupted becomes uncertain and never auto-retryable', () => {
      const s = new MioRecoveryCheckpointStore();
      const id = row('write', true);
      s.prepare(id, 10); s.transition(id, 'EXECUTING', 11);
      assert(s.decision(id) === 'MANUAL_REVIEW_REQUIRED', 'executing mutation was retryable');
      assert(s.interrupted(id, 12).state === 'UNCERTAIN', 'interruption not marked uncertain');
      assert(s.decision(id) === 'MANUAL_REVIEW_REQUIRED', 'uncertain mutation was retryable');
      rejects(() => s.transition(id, 'COMMITTED', 13), 'uncertain action was committed');
      rejects(() => s.interrupted(id, 13), 'uncertain action interrupted twice');
    }],
    ['committed and failed states remain terminal', () => {
      const s = new MioRecoveryCheckpointStore();
      const id = row('read', false);
      s.prepare(id, 20); s.transition(id, 'EXECUTING', 21); s.transition(id, 'COMMITTED', 22);
      assert(s.decision(id) === 'NO_ACTION', 'committed action replays');
      rejects(() => s.transition(id, 'FAILED', 23), 'terminal state changed');
      const other = row('bad', true);
      s.prepare(other, 24); s.transition(other, 'FAILED', 25);
      assert(s.decision(other) === 'SAFE_TO_REPLAN', 'unexecuted failure not replanable');
    }],
    ['idempotency, project isolation and immutable copies', () => {
      const s = new MioRecoveryCheckpointStore();
      const id = row('dedup', true);
      const first = s.prepare(id, 1);
      first.state = 'COMMITTED';
      assert(s.get(id)?.state === 'PREPARED', 'external mutation leaked');
      rejects(() => s.prepare(id, 2), 'duplicate accepted');
      rejects(() => s.prepare({ ...id, actionId: 'different' }, 2), 'duplicate idempotency key accepted');
      assert(s.list('project_B').length === 0, 'cross-project listing');
      assert(s.clearResolved('project_B') === 0, 'cross-project clear');
    }],
    ['unresolved mutation is never silently evicted', () => {
      const s = new MioRecoveryCheckpointStore(1);
      const id = row('pending', true);
      s.prepare(id, 1); s.transition(id, 'EXECUTING', 2);
      rejects(() => s.prepare(row('second', false), 3), 'pending mutation evicted');
      assert(s.get(id)?.state === 'EXECUTING', 'pending mutation lost');
      s.interrupted(id, 4);
      rejects(() => s.prepare(row('second', false), 5), 'uncertain mutation evicted');
    }],
    ['read-only interruptions can be replanned; times and identifiers are validated', () => {
      const s = new MioRecoveryCheckpointStore();
      const id = row('readSafe', false);
      s.prepare(id, 10); s.transition(id, 'EXECUTING', 11);
      s.interrupted(id, 12);
      assert(s.decision(id) === 'SAFE_TO_REPLAN', 'read-only replan blocked');
      rejects(() => s.prepare(row('wrong space', false)), 'invalid identifier accepted');
      rejects(() => s.transition(id, 'EXECUTING', 13), 'invalid transition accepted');
      assert(s.clearResolved('project_A') === 1, 'resolved checkpoint could not be cleared');
    }],
  ];
  let passed = 0;
  for (const [name, fn] of tests) { fn(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
