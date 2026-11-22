/** PRV-11.04a: shared bounded binary journal protocol, independent of file I/O. */
import * as crypto from 'node:crypto';
const MAGIC = Buffer.from('MIOJ01', 'ascii');
const HEADER_BYTES = 6 + 4 + 32;
export const MAX_PAYLOAD = 256 * 1024;
export const MAX_JOURNAL = 8 * 1024 * 1024;
const ZERO_DIGEST = Buffer.alloc(32, 0);
const reject = (code: string): never => { throw new Error(code); };
const hashRecord = (previous: Buffer, payload: Buffer): Buffer =>
  crypto.createHash('sha256').update(previous).update(payload).digest();

export interface JournalPrototypeEntry {
  readonly offset: number;
  readonly json: string;
  readonly digest: string;
}

export function decodeJournalRecords(bytes: Buffer): { entries: JournalPrototypeEntry[]; lastHash: Buffer; size: number } {
  if (bytes.length > MAX_JOURNAL) reject('MIO_WINDOWS_JOURNAL_FILE_INVALID');
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
export function encodeJournalRecord(json: string, previous: Buffer, currentSize: number): { record: Buffer; digest: Buffer } {
  if (typeof json !== 'string') reject('MIO_WINDOWS_JOURNAL_PAYLOAD_INVALID');
  const payload = Buffer.from(json, 'utf8');
  if (!payload.length || payload.length > MAX_PAYLOAD) reject('MIO_WINDOWS_JOURNAL_PAYLOAD_INVALID');
  try { JSON.parse(json); } catch { reject('MIO_WINDOWS_JOURNAL_INVALID_JSON'); }
  if (previous.length !== 32 || !Number.isSafeInteger(currentSize) || currentSize < 0 || currentSize + HEADER_BYTES + payload.length > MAX_JOURNAL) reject('MIO_WINDOWS_JOURNAL_LIMIT');
  const digest = hashRecord(previous, payload);
  const record = Buffer.alloc(HEADER_BYTES + payload.length);
  MAGIC.copy(record, 0);
  record.writeUInt32BE(payload.length, MAGIC.length);
  digest.copy(record, 10);
  payload.copy(record, HEADER_BYTES);
  return { record, digest };
}
