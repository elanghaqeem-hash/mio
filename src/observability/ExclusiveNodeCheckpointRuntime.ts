/**
 * PRV-10.06c — explicit single-writer Node runtime checkpoint activation.
 * A process must hold an exclusive filesystem lease before constructing a mutation gate.
 * Locks are deliberately NOT auto-reclaimed following crashes: require operator review.
 * Never import this module into browser/renderer bundles.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MioCheckpointPersistence } from './MioCheckpointPersistence';
import { PersistentMutationCheckpointGate } from './PersistentMutationCheckpointGate';
import { NodeFileCheckpointStorage } from './NodeFileCheckpointStorage';

export interface ExclusiveNodeCheckpointRuntime {
  readonly gate: PersistentMutationCheckpointGate;
  /** Release only during orderly shutdown when all mutating work has completed. */
  close(): void;
}

const unsafe = (): never => { throw new Error('CHECKPOINT_WRITER_LOCK_UNAVAILABLE'); };

export function createExclusiveNodeCheckpointRuntime(userDataRoot: string): ExclusiveNodeCheckpointRuntime {
  if (!path.isAbsolute(userDataRoot)) unsafe();
  const root = path.resolve(userDataRoot);
  if (!fs.existsSync(root) || !fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) unsafe();
  // Use the same directory as the durable checkpoint store; it is initialized by the adapter.
  const storage = new NodeFileCheckpointStorage(root);
  const lockPath = path.join(root, 'mio-runtime-checkpoints-v1', '.exclusive-writer.lock');
  let fd: number;
  try {
    fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  } catch { return unsafe(); }
  let closed = false;
  try {
    fs.writeFileSync(fd, JSON.stringify({ version: 1, pid: process.pid, createdAt: new Date().toISOString() }));
    fs.fsyncSync(fd);
    const directoryFd = fs.openSync(path.dirname(lockPath), 'r');
    try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
    // The lock is acquired before any checkpoint is loaded or mutation admitted.
    const gate = new PersistentMutationCheckpointGate(new MioCheckpointPersistence(storage));
    return {
      gate,
      close() {
        if (closed) return;
        closed = true;
        // Never close during in-flight work. The caller owns executor lifecycle.
        try {
          const stat = fs.fstatSync(fd);
          const current = fs.lstatSync(lockPath);
          if (current.dev !== stat.dev || current.ino !== stat.ino || !current.isFile() || current.isSymbolicLink()) unsafe();
          fs.unlinkSync(lockPath);
          syncDirectory(path.dirname(lockPath));
        } finally { fs.closeSync(fd); }
      },
    };
  } catch (error) {
    try { fs.closeSync(fd); } catch { /* retain original failure */ }
    // Deliberately retain the lock on ambiguous initialization failure: manual review needed.
    throw error;
  }
}

function syncDirectory(directory: string): void {
  const descriptor = fs.openSync(directory, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}
