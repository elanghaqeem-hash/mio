/**
 * PRV-11.03c — bounded append-only checkpoint journal prototype.
 *
 * NOT a MioCheckpointStorage implementation, NOT a production durability
 * backend. A trusted operator must pre-provision the file and a single writer.
 * No directory creation, atomic-rename claim, auto-tail repair or replay.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { decodeJournalRecords, encodeJournalRecord, MAX_JOURNAL, type JournalPrototypeEntry } from './WindowsJournalBinaryCodec';
export type { JournalPrototypeEntry } from './WindowsJournalBinaryCodec';
const reject = (code: string): never => { throw new Error(code); };

/**
 * Validate pathname both before and after opening. A symlink, special file
 * or redirected path is rejected; POSIX additionally compares file identity.
 * On Windows, Node file-id behavior is filesystem dependent, so this is
 * defense-in-depth, NOT a guarantee against hostile concurrent renames.
 */
function withValidatedJournalFile<T>(filename: string, flags: number, operation: (fd: number) => T): T {
  const pre = fs.lstatSync(filename);
  if (!pre.isFile() || pre.isSymbolicLink()) reject('MIO_WINDOWS_JOURNAL_UNSAFE_PATH');
  const fd = fs.openSync(filename, flags | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const held = fs.fstatSync(fd);
    if (!held.isFile() || held.size > MAX_JOURNAL)
      reject('MIO_WINDOWS_JOURNAL_FILE_INVALID');
    const current = fs.lstatSync(filename);
    if (!current.isFile() || current.isSymbolicLink())
      reject('MIO_WINDOWS_JOURNAL_UNSAFE_PATH');
    if (process.platform !== 'win32' &&
        (pre.dev !== held.dev || pre.ino !== held.ino ||
         current.dev !== held.dev || current.ino !== held.ino))
      reject('MIO_WINDOWS_JOURNAL_FILE_CHANGED');
    const result = operation(fd);
    const post = fs.lstatSync(filename);
    if (!post.isFile() || post.isSymbolicLink())
      reject('MIO_WINDOWS_JOURNAL_UNSAFE_PATH');
    if (process.platform !== 'win32' && (post.dev !== held.dev || post.ino !== held.ino))
      reject('MIO_WINDOWS_JOURNAL_FILE_CHANGED');
    return result;
  } finally { fs.closeSync(fd); }
}

function readRecords(fd: number): { entries: JournalPrototypeEntry[]; lastHash: Buffer; size: number } {
  const stat = fs.fstatSync(fd);
  if (!stat.isFile() || stat.size > MAX_JOURNAL) reject('MIO_WINDOWS_JOURNAL_FILE_INVALID');
  const bytes = Buffer.alloc(stat.size);
  let read = 0;
  while (read < bytes.length) {
    const got = fs.readSync(fd, bytes, read, bytes.length - read, read);
    if (!got) reject('MIO_WINDOWS_JOURNAL_SHORT_READ');
    read += got;
  }
  return decodeJournalRecords(bytes);
}

export class WindowsCheckpointJournalPrototype {
  private readonly filename: string;
  constructor(filename: string) {
    if (!path.isAbsolute(filename)) reject('MIO_WINDOWS_JOURNAL_PATH_INVALID');
    this.filename = filename;
  }
  /** Never creates a journal or its parent directory. */
  inspect(): JournalPrototypeEntry[] {
    return withValidatedJournalFile(this.filename, fs.constants.O_RDONLY, fd => readRecords(fd).entries);
  }
  /**
   * Requires external single-writer coordination. fsync commits bytes to the
   * file handle; this alone does NOT attest power-loss-safe publication of a
   * newly created file or NTFS metadata.
   */
  append(json: string): JournalPrototypeEntry {
    // Validate the payload before opening the file, preserving fail-closed behavior.
    encodeJournalRecord(json, Buffer.alloc(32), 0);
    return withValidatedJournalFile(this.filename, fs.constants.O_RDWR, fd => {
      const state = readRecords(fd);
      const { record, digest } = encodeJournalRecord(json, state.lastHash, state.size);
      let written = 0;
      while (written < record.length) {
        const count = fs.writeSync(fd, record, written, record.length - written, state.size + written);
        if (!count) reject('MIO_WINDOWS_JOURNAL_SHORT_WRITE');
        written += count;
      }
      fs.fsyncSync(fd);
      const verified = readRecords(fd);
      if (verified.entries.length !== state.entries.length + 1 ||
          verified.entries.at(-1)?.digest !== digest.toString('hex'))
        reject('MIO_WINDOWS_JOURNAL_VERIFY_FAILED');
      return verified.entries[verified.entries.length - 1];
    });
  }
}
