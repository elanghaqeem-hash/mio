/**
 * PRV-10.04a: strict, scoped checkpoint serialization and restart reconciliation.
 * Persistence is supplied by an injected durable storage adapter. This module never auto-replays tasks.
 * No prompts, file paths, credentials or arbitrary metadata are accepted in the snapshot.
 */
import { MioRecoveryCheckpointStore, type MioRecoveryCheckpoint } from './MioRecoveryCheckpointStore';

export const MIO_CHECKPOINT_ARCHIVE_VERSION = 1 as const;
export interface MioCheckpointArchive {
  version: typeof MIO_CHECKPOINT_ARCHIVE_VERSION;
  projectId: string;
  checkpoints: MioRecoveryCheckpoint[];
}
export interface MioCheckpointStorage {
  /** Must return bytes written in an earlier session, or null when first initialized. */
  read(projectId: string): Promise<string | null>;
  /** Implementations MUST atomically replace and durably flush bytes before resolving. */
  atomicWrite(projectId: string, serialized: string): Promise<void>;
}
const SAFE = /^[A-Za-z0-9_.:-]{1,200}$/;
const STATES = new Set(['PREPARED', 'EXECUTING', 'COMMITTED', 'FAILED', 'UNCERTAIN']);
const ROW_KEYS = ['projectId', 'taskId', 'actionId', 'idempotencyKey', 'mutates', 'state', 'createdAt', 'updatedAt'];
const TOP_KEYS = ['version', 'projectId', 'checkpoints'];
const MAX_ROWS = 250;
const MAX_BYTES = 256 * 1024;
const own = (x: object, k: string) => Object.prototype.hasOwnProperty.call(x, k);
const exactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => own(v, k));
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const timestamp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const identity = (v: unknown): v is string => typeof v === 'string' && SAFE.test(v);
const refuse = (): never => { throw new Error('CHECKPOINT_ARCHIVE_INVALID'); };

export function serializeCheckpointArchive(store: MioRecoveryCheckpointStore, projectId: string): string {
  if (!identity(projectId)) refuse();
  const records = store.list(projectId);
  if (records.length > MAX_ROWS) refuse();
  const archive: MioCheckpointArchive = { version: MIO_CHECKPOINT_ARCHIVE_VERSION, projectId, checkpoints: records };
  const json = JSON.stringify(archive);
  if (new TextEncoder().encode(json).byteLength > MAX_BYTES) refuse();
  return json;
}

/** Throws on any malformed/unscoped history. NEVER resets to an empty ledger on parse error. */
export function recoverCheckpointArchive(raw: string, projectId: string): MioRecoveryCheckpointStore {
  if (!identity(projectId) || typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > MAX_BYTES) refuse();
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { refuse(); }
  if (!object(decoded) || !exactKeys(decoded, TOP_KEYS) || decoded.version !== MIO_CHECKPOINT_ARCHIVE_VERSION || decoded.projectId !== projectId ||
      !Array.isArray(decoded.checkpoints) || decoded.checkpoints.length > MAX_ROWS) refuse();
  const store = new MioRecoveryCheckpointStore(MAX_ROWS);
  for (const value of decoded.checkpoints) {
    if (!object(value) || !exactKeys(value, ROW_KEYS) ||
        !identity(value.projectId) || value.projectId !== projectId ||
        !identity(value.taskId) || !identity(value.actionId) || !identity(value.idempotencyKey) ||
        typeof value.mutates !== 'boolean' || !STATES.has(value.state as string) ||
        !timestamp(value.createdAt) || !timestamp(value.updatedAt) || value.updatedAt < value.createdAt) refuse();
    const id = { projectId, taskId: value.taskId as string, actionId: value.actionId as string };
    try {
      store.prepare({ ...id, idempotencyKey: value.idempotencyKey as string, mutates: value.mutates as boolean }, value.createdAt as number);
      const at = value.updatedAt as number;
      switch (value.state) {
        case 'PREPARED':
          if (at !== value.createdAt) refuse();
          break;
        case 'FAILED':
          // Recovered FAILED is conservative: any prior execution cannot be proven safe from a snapshot.
          // In-flight mutations must have been recorded as UNCERTAIN before persistence.
          store.transition(id, 'FAILED', at);
          break;
        case 'EXECUTING':
          store.transition(id, 'EXECUTING', at);
          store.interrupted(id, at); // uncertain on restart; read-only execution becomes FAILED
          break;
        case 'COMMITTED':
          store.transition(id, 'EXECUTING', at);
          store.transition(id, 'COMMITTED', at);
          break;
        case 'UNCERTAIN':
          if (value.mutates !== true) refuse();
          store.transition(id, 'EXECUTING', at);
          store.interrupted(id, at);
          break;
        default: refuse();
      }
    } catch { refuse(); }
  }
  return store;
}

/** Storage adapter must provide atomic durability; this layer only validates and enforces fail-closed loading. */
export class MioCheckpointPersistence {
  constructor(private readonly storage: MioCheckpointStorage) {}
  async save(projectId: string, store: MioRecoveryCheckpointStore): Promise<void> {
    const encoded = serializeCheckpointArchive(store, projectId);
    await this.storage.atomicWrite(projectId, encoded);
  }
  async load(projectId: string): Promise<MioRecoveryCheckpointStore> {
    if (!identity(projectId)) refuse();
    const encoded = await this.storage.read(projectId);
    if (encoded === null) return new MioRecoveryCheckpointStore(MAX_ROWS);
    return recoverCheckpointArchive(encoded, projectId);
  }
}
