/**
 * PRV-10.04b — Electron-main-process durable mutation checkpoints.
 * No prompts, file paths, content or credentials are stored, only opaque transaction/operation identities.
 * One file per workspace, with atomic replace, fsync(file), rename and fsync(directory).
 * Strict fail-closed recovery: EXECUTING from a previous process is UNCERTAIN, never replayed.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export type DesktopCheckpointState = 'PREPARED' | 'EXECUTING' | 'COMMITTED' | 'UNCERTAIN';
export interface DesktopCheckpoint {
  transactionId: string;
  operationId: string;
  state: DesktopCheckpointState;
}
interface Archive { version: 1; workspaceId: string; records: DesktopCheckpoint[] }
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const MAX_RECORDS = 250;
const MAX_BYTES = 128 * 1024;
const states = new Set<DesktopCheckpointState>(['PREPARED', 'EXECUTING', 'COMMITTED', 'UNCERTAIN']);
const fingerprint = (workspaceId: string): string => crypto.createHash('sha256').update(workspaceId).digest('hex');
const validId = (value: unknown): value is string => typeof value === 'string' && SAFE_ID.test(value);
const validRecord = (value: unknown): value is DesktopCheckpoint => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const fields = Object.keys(record);
  return fields.length === 3 && fields.every(key => ['transactionId', 'operationId', 'state'].includes(key)) &&
    validId(record.transactionId) && validId(record.operationId) && states.has(record.state as DesktopCheckpointState);
};
const key = (x: DesktopCheckpoint) => JSON.stringify([x.transactionId, x.operationId]);
const fail = (): never => { throw new Error('DURABLE_CHECKPOINT_INVALID'); };

export class DesktopDurableMutationCheckpoints {
  private readonly folder: string;
  constructor(userDataPath: string) {
    this.folder = path.join(userDataPath, 'mutation-checkpoints-v1');
    fs.mkdirSync(this.folder, { recursive: true, mode: 0o700 });
  }
  private filename(workspaceId: string): string {
    if (!validId(workspaceId)) fail();
    return path.join(this.folder, fingerprint(workspaceId) + '.json');
  }
  private load(workspaceId: string): Archive {
    const filename = this.filename(workspaceId);
    if (!fs.existsSync(filename)) return { version: 1, workspaceId, records: [] };
    const bytes = fs.readFileSync(filename);
    if (bytes.length > MAX_BYTES) fail();
    let raw: unknown;
    try { raw = JSON.parse(bytes.toString('utf8')); } catch { fail(); }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
    const archive = raw as Record<string, unknown>;
    if (Object.keys(archive).length !== 3 || archive.version !== 1 || archive.workspaceId !== workspaceId || !Array.isArray(archive.records) || archive.records.length > MAX_RECORDS) fail();
    const records = archive.records as unknown[];
    const used = new Set<string>();
    for (const record of records) {
      if (!validRecord(record)) throw new Error('DURABLE_CHECKPOINT_INVALID');
      if (used.has(key(record))) fail();
      used.add(key(record));
    }
    return { version: 1, workspaceId, records: archive.records as DesktopCheckpoint[] };
  }
  private persist(archive: Archive): void {
    if (archive.records.length > MAX_RECORDS) throw new Error('DURABLE_CHECKPOINT_CAPACITY');
    const filename = this.filename(archive.workspaceId);
    const bytes = Buffer.from(JSON.stringify(archive), 'utf8');
    if (bytes.length > MAX_BYTES) fail();
    const tmp = filename + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
    let file: number | undefined;
    try {
      file = fs.openSync(tmp, 'wx', 0o600);
      fs.writeFileSync(file, bytes);
      fs.fsyncSync(file);
      fs.closeSync(file);
      file = undefined;
      fs.renameSync(tmp, filename);
      // Fail closed if directory durability cannot be confirmed.
      const dir = fs.openSync(this.folder, 'r');
      try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    } catch (error) {
      if (file !== undefined) { try { fs.closeSync(file); } catch { /* preserve original failure */ } }
      try { fs.unlinkSync(tmp); } catch { /* temp may already be renamed */ }
      throw error;
    }
  }
  /** Reserve all operation IDs *before* starting any mutation. Never discard uncertain history. */
  reserve(workspaceId: string, transactionId: string, operationIds: readonly string[]): void {
    if (!validId(transactionId) || operationIds.length === 0 || operationIds.length > 100 || operationIds.some(x => !validId(x)) || new Set(operationIds).size !== operationIds.length) fail();
    const archive = this.load(workspaceId);
    if (archive.records.some(x => x.transactionId === transactionId)) throw new Error('DURABLE_CHECKPOINT_TRANSACTION_REUSED');
    if (archive.records.length + operationIds.length > MAX_RECORDS) throw new Error('DURABLE_CHECKPOINT_CAPACITY');
    for (const operationId of operationIds) archive.records.push({ transactionId, operationId, state: 'PREPARED' });
    this.persist(archive);
  }
  transition(workspaceId: string, transactionId: string, operationId: string, next: Exclude<DesktopCheckpointState, 'PREPARED'>): void {
    const archive = this.load(workspaceId);
    const record = archive.records.find(x => x.transactionId === transactionId && x.operationId === operationId);
    if (!record) throw new Error('DURABLE_CHECKPOINT_NOT_FOUND');
    if (!((record.state === 'PREPARED' && next === 'EXECUTING') ||
          (record.state === 'EXECUTING' && (next === 'COMMITTED' || next === 'UNCERTAIN'))))
      throw new Error('DURABLE_CHECKPOINT_TRANSITION_DENIED');
    record.state = next;
    this.persist(archive);
  }
  /** Returns a detached copy; EXECUTING checkpoints are treated as uncertain on process restart. */
  inspect(workspaceId: string): DesktopCheckpoint[] {
    return this.load(workspaceId).records.map(x => ({ ...x, state: x.state === 'EXECUTING' ? 'UNCERTAIN' : x.state }));
  }
}
