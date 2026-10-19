/**
 * PRV-10.06c — trusted Node-only runtime bootstrap.
 * Acquires an exclusive persistent writer lease before constructing a checkpointed protocol.
 * Crash leaves the lease in place: an operator must reconcile before manual removal.
 * This module must never be imported by browser or Cloudflare entrypoints.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultCapabilityProtocol, type DefaultCapabilityProtocolOptions } from '../capabilities/defaultCapabilityProtocol';
import { MioCheckpointPersistence } from './MioCheckpointPersistence';
import { NodeFileCheckpointStorage } from './NodeFileCheckpointStorage';
import { PersistentMutationCheckpointGate, type MioMutationCheckpointGate, type MutationCheckpointIdentity } from './PersistentMutationCheckpointGate';

const fail = (code: string): never => { throw new Error(code); };
const NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
const recordKey = (identity: MutationCheckpointIdentity): string =>
  JSON.stringify([identity.projectId, identity.taskId, identity.requestId]);

export class NodeCheckpointWriterLease {
  private readonly filename: string;
  private readonly token: string;
  private closed = false;

  constructor(rootDirectory: string) {
    if (!path.isAbsolute(rootDirectory)) fail('CHECKPOINT_LEASE_ROOT_INVALID');
    const directory = path.join(rootDirectory, 'mio-runtime-checkpoints-v1');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const dirStat = fs.lstatSync(directory);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) fail('CHECKPOINT_LEASE_DIRECTORY_UNSAFE');
    this.filename = path.join(directory, '.single-writer.lock');
    this.token = crypto.randomBytes(24).toString('hex');
    let fd: number | undefined;
    try {
      fd = fs.openSync(this.filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW, 0o600);
      fs.writeFileSync(fd, JSON.stringify({ version: 1, token: this.token }));
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      const dir = fs.openSync(directory, fs.constants.O_RDONLY | NOFOLLOW);
      try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    } catch (error) {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* preserve failure */ } }
      // Deliberately never unlink after failure: a crash or uncertain fsync must remain blocked.
      throw error;
    }
  }

  assertActive(): void {
    if (this.closed) fail('CHECKPOINT_LEASE_CLOSED');
    let fd = -1;
    try { fd = fs.openSync(this.filename, fs.constants.O_RDONLY | NOFOLLOW); }
    catch { fail('CHECKPOINT_LEASE_LOST'); }
    if (fd < 0) fail('CHECKPOINT_LEASE_LOST');
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > 256 || stat.size === 0) fail('CHECKPOINT_LEASE_INVALID');
      const record: unknown = JSON.parse(fs.readFileSync(fd, 'utf8'));
      if (!record || typeof record !== 'object' || Array.isArray(record) ||
          Object.keys(record).length !== 2 || (record as { version?: unknown }).version !== 1 ||
          (record as { token?: unknown }).token !== this.token) fail('CHECKPOINT_LEASE_OWNERSHIP_LOST');
    } finally { fs.closeSync(fd); }
  }

  /** Explicit graceful shutdown only; never call on crash or while mutations are running. */
  close(): void {
    this.assertActive();
    fs.unlinkSync(this.filename);
    const dir = fs.openSync(path.dirname(this.filename), fs.constants.O_RDONLY | NOFOLLOW);
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    this.closed = true;
  }
}

/** Prevents release while mutations remain in flight, and rejects use after lease loss. */
export class LeasedMutationCheckpointGate implements MioMutationCheckpointGate {
  private readonly active = new Set<string>();
  private closed = false;
  constructor(private readonly lease: NodeCheckpointWriterLease, private readonly inner: PersistentMutationCheckpointGate) {}
  async begin(identity: MutationCheckpointIdentity): Promise<void> {
    if (this.closed) fail('CHECKPOINT_RUNTIME_CLOSED');
    this.lease.assertActive();
    const key = recordKey(identity);
    if (this.active.has(key)) fail('CHECKPOINT_MUTATION_ALREADY_ACTIVE');
    this.active.add(key);
    try { await this.inner.begin(identity); }
    catch (error) { this.active.delete(key); throw error; }
  }
  async complete(identity: MutationCheckpointIdentity, committed: boolean): Promise<void> {
    if (this.closed) fail('CHECKPOINT_RUNTIME_CLOSED');
    this.lease.assertActive();
    const key = recordKey(identity);
    if (!this.active.has(key)) fail('CHECKPOINT_MUTATION_NOT_ACTIVE');
    try { await this.inner.complete(identity, committed); }
    finally { this.active.delete(key); }
  }
  close(): void {
    if (this.closed) return;
    if (this.active.size !== 0) fail('CHECKPOINT_MUTATIONS_IN_FLIGHT');
    this.lease.close();
    this.closed = true;
  }
}

export function createTrustedNodeCheckpointRuntime(
  rootDirectory: string,
  options: Omit<DefaultCapabilityProtocolOptions, 'checkpointGate'>,
) {
  const lease = new NodeCheckpointWriterLease(rootDirectory);
  try {
    const storage = new NodeFileCheckpointStorage(rootDirectory);
    const persistence = new MioCheckpointPersistence(storage);
    const gate = new LeasedMutationCheckpointGate(lease, new PersistentMutationCheckpointGate(persistence));
    const protocol = createDefaultCapabilityProtocol({ ...options, checkpointGate: gate });
    return { protocol, gate, close: () => gate.close() };
  } catch (error) {
    // If construction fails, leave a persistent lock for explicit inspection, not silent takeover.
    throw error;
  }
}
