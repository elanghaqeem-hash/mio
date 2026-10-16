/**
 * MIO-PRV-10.04a — validated, metadata-only snapshot reconciliation.
 *
 * This module does not perform disk writes, encryption, or automatic replay. A host
 * must provide trusted durable storage and independently enforce integrity/access.
 * Treat EXECUTING records as interrupted after restart; mutations become UNCERTAIN.
 */
import { MioRecoveryCheckpointStore, type MioRecoveryCheckpoint } from './MioRecoveryCheckpointStore';

export const MIO_RECOVERY_SNAPSHOT_VERSION = 1 as const;
export interface MioRecoverySnapshot {
  version: typeof MIO_RECOVERY_SNAPSHOT_VERSION;
  projectId: string;
  capturedAt: number;
  checkpoints: MioRecoveryCheckpoint[];
}
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const STATES = new Set(['PREPARED', 'EXECUTING', 'COMMITTED', 'FAILED', 'UNCERTAIN']);
const MAX_CHECKPOINTS = 250;
const MAX_SERIALIZED_BYTES = 125_000;
const ROW_FIELDS = ['projectId', 'taskId', 'actionId', 'idempotencyKey', 'mutates', 'state', 'createdAt', 'updatedAt'] as const;
const SNAPSHOT_FIELDS = ['version', 'projectId', 'capturedAt', 'checkpoints'] as const;
type Dict = Record<string, unknown>;
const object = (value: unknown): value is Dict => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value: Dict, allowed: readonly string[]): boolean => Object.keys(value).every(k => allowed.includes(k)) && allowed.every(k => k in value);
const finiteTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const validId = (value: unknown): value is string => typeof value === 'string' && SAFE_ID.test(value);
const clone = (row: MioRecoveryCheckpoint): MioRecoveryCheckpoint => ({ ...row });

/** Export only metadata belonging to the explicitly selected project. */
export function captureRecoverySnapshot(store: MioRecoveryCheckpointStore, projectId: string, capturedAt = Date.now()): MioRecoverySnapshot {
  if (!validId(projectId) || !finiteTime(capturedAt)) throw new Error('RECOVERY_SNAPSHOT_SCOPE_INVALID');
  return {
    version: MIO_RECOVERY_SNAPSHOT_VERSION, projectId, capturedAt,
    checkpoints: store.list(projectId).map(clone),
  };
}

/**
 * Reject untrusted/malformed snapshots, with no partial restoration on failure.
 * Does not trust a persisted EXECUTING state after a restart.
 */
export function reconcileRecoverySnapshot(input: unknown, expectedProjectId: string): MioRecoveryCheckpointStore {
  if (!validId(expectedProjectId) || !object(input) || !fields(input, SNAPSHOT_FIELDS) ||
      input.version !== MIO_RECOVERY_SNAPSHOT_VERSION || input.projectId !== expectedProjectId ||
      !finiteTime(input.capturedAt) || !Array.isArray(input.checkpoints) ||
      input.checkpoints.length > MAX_CHECKPOINTS) throw new Error('RECOVERY_SNAPSHOT_INVALID');

  let bytes = 0;
  try { bytes = new TextEncoder().encode(JSON.stringify(input)).length; }
  catch { throw new Error('RECOVERY_SNAPSHOT_INVALID'); }
  if (bytes > MAX_SERIALIZED_BYTES) throw new Error('RECOVERY_SNAPSHOT_OVERSIZE');
  const uniqueActions = new Set<string>();
  const uniqueIdempotency = new Set<string>();
  const rows: MioRecoveryCheckpoint[] = [];
  for (const raw of input.checkpoints) {
    if (!object(raw) || !fields(raw, ROW_FIELDS) ||
        !validId(raw.projectId) || raw.projectId !== expectedProjectId ||
        !validId(raw.taskId) || !validId(raw.actionId) || !validId(raw.idempotencyKey) ||
        typeof raw.mutates !== 'boolean' || !STATES.has(raw.state) ||
        !finiteTime(raw.createdAt) || !finiteTime(raw.updatedAt) ||
        raw.createdAt > raw.updatedAt || raw.updatedAt > input.capturedAt) throw new Error('RECOVERY_SNAPSHOT_ROW_INVALID');
    const actionKey = JSON.stringify([raw.taskId, raw.actionId]);
    if (uniqueActions.has(actionKey) || uniqueIdempotency.has(raw.idempotencyKey)) throw new Error('RECOVERY_SNAPSHOT_DUPLICATE');
    uniqueActions.add(actionKey);
    uniqueIdempotency.add(raw.idempotencyKey);
    rows.push(raw as unknown as MioRecoveryCheckpoint);
  }

  const restored = new MioRecoveryCheckpointStore(MAX_CHECKPOINTS);
  for (const row of rows) {
    const id = { projectId: row.projectId, taskId: row.taskId, actionId: row.actionId };
    restored.prepare({ ...id, idempotencyKey: row.idempotencyKey, mutates: row.mutates }, row.createdAt);
    if (row.state === 'PREPARED') continue;
    if (row.state === 'FAILED') {
      // A persisted failed mutation may only be safe if it never entered EXECUTING.
      restored.transition(id, 'FAILED', row.updatedAt);
      continue;
    }
    restored.transition(id, 'EXECUTING', row.updatedAt);
    if (row.state === 'COMMITTED') restored.transition(id, 'COMMITTED', row.updatedAt);
    else restored.interrupted(id, row.updatedAt);
    // For both EXECUTING and UNCERTAIN, mutating work remains UNCERTAIN.
  }
  return restored;
}
