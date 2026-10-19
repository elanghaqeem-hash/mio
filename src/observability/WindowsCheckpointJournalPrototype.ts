/**
 * PRV-11.03c — bounded append-only checkpoint journal prototype.
 *
 * NOT a MioCheckpointStorage implementation, NOT a production durability
 * backend. A trusted operator must pre-provision the file and a single writer.
 * No directory creation, atomic-rename claim, auto-tail repair or replay.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MAGIC = Buffer.from('MIOJ01', 'ascii');
const HEADER_BYTES = 6 + 4 + 32;
const MAX_PAYLOAD = 256 * 1024;
const MAX_JOURNAL = 8 * 1024 * 1024;
const ZERO_DIGEST = Buffer.alloc(32, 0);
const reject = (code: string): never => { throw new Error(code); };
const hashRecord = (previous: Buffer, payload: Buffer): Buffer =>
  crypto.createHash('sha256').update(previous).update(payload).digest();

export interface JournalPrototypeEntry {
  readonly offset: number;
  readonly json: string;
  readonly digest: string;
}

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
  const entries: JournalPrototypeEntry[] = [];
  let previous = ZERO_DIGEST;
  let offset = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < HEADER_BYTES) reject('MIO_WINDOWS_JOURNAL_TORN_TAIL');
    if (!bytes.subarray(offset, offset + MAGIC.length).equals(MAGIC)) reject('MIO_WINDOWS_JOURNAL_BAD_MAGIC');
    const length = bytes.readUInt32BE(offset + MAGIC.length);
    if (length < 1 || length > MAX_PAYLOAD || offset + HEADER_BYTES + length > bytes.length)
      reject('MIO_WINDOWS_JOURNAL_TORN_OR_OVERSIZED');
    const payload = bytes.subarray(offset + HEADER_BYTES, offset + HEADER_BYTES + length);
    const digest = bytes.subarray(offset + 10, offset + HEADER_BYTES);
    const expected = hashRecord(previous, payload);
    if (!crypto.timingSafeEqual(digest, expected)) reject('MIO_WINDOWS_JOURNAL_HASH_CHAIN_BROKEN');
    const json = payload.toString('utf8');
    if (!Buffer.from(json, 'utf8').equals(payload)) reject('MIO_WINDOWS_JOURNAL_INVALID_UTF8');
    try { JSON.parse(json); } catch { reject('MIO_WINDOWS_JOURNAL_INVALID_JSON'); }
    entries.push({ offset, json, digest: expected.toString('hex') });
    previous = Buffer.from(expected);
    offset += HEADER_BYTES + length;
  }
  return { entries, lastHash: previous, size: bytes.length };
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
    if (typeof json !== 'string') reject('MIO_WINDOWS_JOURNAL_PAYLOAD_INVALID');
    const payload = Buffer.from(json, 'utf8');
    if (!payload.length || payload.length > MAX_PAYLOAD) reject('MIO_WINDOWS_JOURNAL_PAYLOAD_INVALID');
    try { JSON.parse(json); } catch { reject('MIO_WINDOWS_JOURNAL_INVALID_JSON'); }
    return withValidatedJournalFile(this.filename, fs.constants.O_RDWR, fd => {
      const state = readRecords(fd); // Reject existing corruption, including torn tail.
      if (state.size + HEADER_BYTES + payload.length > MAX_JOURNAL) reject('MIO_WINDOWS_JOURNAL_LIMIT');
      const digest = hashRecord(state.lastHash, payload);
      const record = Buffer.alloc(HEADER_BYTES + payload.length);
      MAGIC.copy(record, 0);
      record.writeUInt32BE(payload.length, MAGIC.length);
      digest.copy(record, 10);
      payload.copy(record, HEADER_BYTES);
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
