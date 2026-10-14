/**
 * PRV-10.03 — conservative recovery checkpoint policy.
 * In-memory metadata only. This does NOT perform persistence or replay.
 * A mutating action that started must never be automatically retried after interruption.
 */
export type CheckpointState = 'PREPARED' | 'EXECUTING' | 'COMMITTED' | 'FAILED' | 'UNCERTAIN';
export type RecoveryDecision = 'NO_ACTION' | 'MANUAL_REVIEW_REQUIRED' | 'SAFE_TO_REPLAN';
export interface MioRecoveryCheckpoint {
  projectId: string;
  taskId: string;
  actionId: string;
  idempotencyKey: string;
  mutates: boolean;
  state: CheckpointState;
  createdAt: number;
  updatedAt: number;
}
const SAFE = /^[A-Za-z0-9_.:-]{1,200}$/;
const MAX_RECORDS = 250;
const isTime = (t: number) => Number.isFinite(t) && t >= 0;
type KeyFields = Pick<MioRecoveryCheckpoint, 'projectId' | 'taskId' | 'actionId'>;
const keyFor = (v: KeyFields) => JSON.stringify([v.projectId, v.taskId, v.actionId]);
const clone = (c: MioRecoveryCheckpoint): MioRecoveryCheckpoint => ({ ...c });

export class MioRecoveryCheckpointStore {
  private readonly rows = new Map<string, MioRecoveryCheckpoint>();
  constructor(private readonly maxRecords = MAX_RECORDS) {
    if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 1000) throw new Error('CHECKPOINT_LIMIT_INVALID');
  }
  prepare(input: Omit<MioRecoveryCheckpoint, 'state' | 'createdAt' | 'updatedAt'>, now = Date.now()): MioRecoveryCheckpoint {
    if (![input.projectId, input.taskId, input.actionId, input.idempotencyKey].every(x => SAFE.test(x)) || !isTime(now))
      throw new Error('CHECKPOINT_INPUT_INVALID');
    const key = keyFor(input);
    if (this.rows.has(key)) throw new Error('CHECKPOINT_ALREADY_EXISTS');
    // Reject reuse across actions in one project; a duplicate key must not conceal a second mutation.
    if ([...this.rows.values()].some(x => x.projectId === input.projectId && x.idempotencyKey === input.idempotencyKey))
      throw new Error('CHECKPOINT_IDEMPOTENCY_CONFLICT');
    while (this.rows.size >= this.maxRecords) {
      const oldest = this.rows.keys().next().value;
      if (oldest === undefined) break;
      // Never silently evict unresolved mutating work.
      const row = this.rows.get(oldest)!;
      if (row.mutates && (row.state === 'EXECUTING' || row.state === 'UNCERTAIN'))
        throw new Error('CHECKPOINT_CAPACITY_BLOCKED');
      this.rows.delete(oldest);
    }
    const row: MioRecoveryCheckpoint = { ...input, state: 'PREPARED', createdAt: now, updatedAt: now };
    this.rows.set(key, row);
    return clone(row);
  }
  private own(input: KeyFields): MioRecoveryCheckpoint {
    const row = this.rows.get(keyFor(input));
    if (!row) throw new Error('CHECKPOINT_NOT_FOUND');
    return row;
  }
  transition(input: KeyFields, next: Exclude<CheckpointState, 'PREPARED'>, now = Date.now()): MioRecoveryCheckpoint {
    const row = this.own(input);
    if (!isTime(now) || now < row.updatedAt) throw new Error('CHECKPOINT_TIME_INVALID');
    const allowed: Record<CheckpointState, readonly CheckpointState[]> = {
      PREPARED: ['EXECUTING', 'FAILED'],
      EXECUTING: ['COMMITTED', 'FAILED', 'UNCERTAIN'],
      COMMITTED: [], FAILED: [], UNCERTAIN: [],
    };
    if (!allowed[row.state].includes(next)) throw new Error('CHECKPOINT_TRANSITION_DENIED');
    row.state = next;
    row.updatedAt = now;
    return clone(row);
  }
  /** An interruption of EXECUTING mutation is UNKNOWN, never an automatic retry. */
  interrupted(input: KeyFields, now = Date.now()): MioRecoveryCheckpoint {
    const row = this.own(input);
    if (row.state !== 'EXECUTING') throw new Error('CHECKPOINT_NOT_EXECUTING');
    return this.transition(input, row.mutates ? 'UNCERTAIN' : 'FAILED', now);
  }
  decision(input: KeyFields): RecoveryDecision {
    const row = this.own(input);
    if (row.state === 'COMMITTED') return 'NO_ACTION';
    if (row.mutates && (row.state === 'EXECUTING' || row.state === 'UNCERTAIN')) return 'MANUAL_REVIEW_REQUIRED';
    if (row.state === 'EXECUTING') return 'MANUAL_REVIEW_REQUIRED';
    // This only permits planning/review; it never grants tool execution or replays operations.
    return 'SAFE_TO_REPLAN';
  }
  get(input: KeyFields): MioRecoveryCheckpoint | undefined {
    const row = this.rows.get(keyFor(input));
    return row ? clone(row) : undefined;
  }
  list(projectId: string): MioRecoveryCheckpoint[] {
    if (!SAFE.test(projectId)) return [];
    return [...this.rows.values()].filter(row => row.projectId === projectId).map(clone);
  }
  clearResolved(projectId: string): number {
    let count = 0;
    for (const [key, row] of this.rows) {
      if (row.projectId === projectId && ['COMMITTED', 'FAILED'].includes(row.state)) { this.rows.delete(key); count++; }
    }
    return count;
  }
}
