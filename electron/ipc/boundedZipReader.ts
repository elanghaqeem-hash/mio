import { inflateRawSync } from 'zlib';

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 512;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_OUTPUT_BYTES = 8 * 1024 * 1024;

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] * 0x1000000)) >>> 0;

function safeName(name: string): void {
  if (!name || name.includes('\0') || name.startsWith('/') || name.startsWith('\\') || /^[a-z]:/i.test(name)) throw new Error('Unsafe ZIP entry path');
  const normalized = name.replace(/\\/g, '/');
  if (normalized.split('/').some((part) => part === '..')) throw new Error('ZIP entry path traversal rejected');
}

export function readBoundedZipEntries(archive: Uint8Array, wantedNames: ReadonlySet<string>): ZipEntry[] {
  if (archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error('Archive exceeds 32MiB bounded reader limit');
  const results: ZipEntry[] = [];
  let offset = 0, entries = 0, totalOutput = 0;
  while (offset + 30 <= archive.length) {
    if (u32(archive, offset) !== 0x04034b50) break;
    entries += 1;
    if (entries > MAX_ENTRIES) throw new Error('ZIP exceeds bounded entry count');
    const flags = u16(archive, offset + 6);
    const method = u16(archive, offset + 8);
    const compressedSize = u32(archive, offset + 18);
    const uncompressedSize = u32(archive, offset + 22);
    const nameLength = u16(archive, offset + 26);
    const extraLength = u16(archive, offset + 28);
    if ((flags & 0x08) !== 0) throw new Error('ZIP data descriptors are not accepted by bounded local reader');
    const nameStart = offset + 30, dataStart = nameStart + nameLength + extraLength, dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) throw new Error('Truncated ZIP entry');
    const name = new TextDecoder('utf-8').decode(archive.subarray(nameStart, nameStart + nameLength));
    safeName(name);
    if (wantedNames.has(name)) {
      if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error('Requested ZIP entry exceeds 2MiB output limit');
      let bytes: Uint8Array;
      if (method === 0) bytes = archive.slice(dataStart, dataEnd);
      else if (method === 8) bytes = new Uint8Array(inflateRawSync(archive.subarray(dataStart, dataEnd), { maxOutputLength: MAX_ENTRY_BYTES }));
      else throw new Error(`Unsupported ZIP compression method: ${method}`);
      if (bytes.byteLength !== uncompressedSize) throw new Error('ZIP entry size evidence does not match decompressed output');
      totalOutput += bytes.byteLength;
      if (totalOutput > MAX_TOTAL_OUTPUT_BYTES) throw new Error('ZIP extraction exceeds total 8MiB output budget');
      results.push({ name, bytes });
    }
    offset = dataEnd;
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}
