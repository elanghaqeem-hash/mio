/**
 * PRV-10.06b — Node-only durable checkpoint storage adapter.
 * Opt-in for trusted Node runtimes, NEVER imported by the browser capability factory.
 * Atomic file replacement and directory sync are required; failures are propagated.
 * Checkpoint archive validation and safe retry decisions are owned by MioCheckpointPersistence.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MioCheckpointStorage } from './MioCheckpointPersistence';

const ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const MAX_BYTES = 256 * 1024;
const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
const fail = (code: string): never => { throw new Error(code); };

export class NodeFileCheckpointStorage implements MioCheckpointStorage {
  private readonly directory: string;

  constructor(rootDirectory: string) {
    if (!path.isAbsolute(rootDirectory)) fail('CHECKPOINT_STORAGE_ROOT_INVALID');
    this.directory = path.join(rootDirectory, 'mio-runtime-checkpoints-v1');
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('CHECKPOINT_STORAGE_ROOT_UNSAFE');
  }

  private pathname(projectId: string): string {
    if (typeof projectId !== 'string' || !ID.test(projectId)) fail('CHECKPOINT_STORAGE_PROJECT_INVALID');
    const digest = crypto.createHash('sha256').update(projectId, 'utf8').digest('hex');
    return path.join(this.directory, digest + '.json');
  }

  async read(projectId: string): Promise<string | null> {
    const filename = this.pathname(projectId);
    let handle: number;
    try {
      handle = fs.openSync(filename, fs.constants.O_RDONLY | O_NOFOLLOW);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    try {
      const stat = fs.fstatSync(handle);
      if (!stat.isFile() || stat.size > MAX_BYTES) fail('CHECKPOINT_STORAGE_FILE_INVALID');
      return fs.readFileSync(handle, { encoding: 'utf8' });
    } finally {
      fs.closeSync(handle);
    }
  }

  async atomicWrite(projectId: string, serialized: string): Promise<void> {
    const filename = this.pathname(projectId);
    if (typeof serialized !== 'string') fail('CHECKPOINT_STORAGE_PAYLOAD_INVALID');
    const bytes = Buffer.from(serialized, 'utf8');
    if (bytes.length > MAX_BYTES) fail('CHECKPOINT_STORAGE_TOO_LARGE');
    // Recheck the existing file before replacement; never follow unexpected symlinks.
    try {
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink()) fail('CHECKPOINT_STORAGE_TARGET_UNSAFE');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const temp = filename + '.' + crypto.randomBytes(12).toString('hex') + '.tmp';
    let handle: number | undefined;
    try {
      handle = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW, 0o600);
      fs.writeFileSync(handle, bytes);
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = undefined;
      fs.renameSync(temp, filename);
      const directoryHandle = fs.openSync(this.directory, fs.constants.O_RDONLY | O_NOFOLLOW);
      try { fs.fsyncSync(directoryHandle); } finally { fs.closeSync(directoryHandle); }
    } catch (error) {
      if (handle !== undefined) { try { fs.closeSync(handle); } catch { /* preserve original */ } }
      try { fs.unlinkSync(temp); } catch { /* already renamed or absent */ }
      throw error;
    }
  }
}
