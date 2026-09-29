import { normalizeFileExtension } from './contracts';

export interface FileSignatureInspection {
  mimeType?: string;
  source: 'SIGNATURE' | 'TEXT_HEURISTIC' | 'UNKNOWN';
  signature: string;
  supported: boolean;
  extensionConsistent?: boolean;
  corruptReason?: string;
}

const MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'video/mp4': ['mp4', 'm4v', 'mov'],
  'audio/mpeg': ['mp3'],
  'audio/wav': ['wav'],
  'application/zip': ['zip', 'docx', 'xlsx', 'pptx'],
};

const starts = (bytes: Uint8Array, values: readonly number[]): boolean =>
  bytes.length >= values.length && values.every((value, index) => bytes[index] === value);

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.slice(start, start + length));

const looksText = (bytes: Uint8Array): boolean => {
  if (bytes.length === 0) return true;
  let printable = 0;
  for (const byte of bytes) {
    if (byte === 0) return false;
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 0x80) printable += 1;
  }
  return printable / bytes.length >= 0.9;
};

export function inspectFileSignature(name: string, bytes: Uint8Array): FileSignatureInspection {
  let mimeType: string | undefined;
  let signature = 'unknown';
  let corruptReason: string | undefined;

  if (starts(bytes, [0xff, 0xd8, 0xff])) { mimeType = 'image/jpeg'; signature = 'jpeg'; }
  else if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) { mimeType = 'image/png'; signature = 'png'; }
  else if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') { mimeType = 'image/gif'; signature = 'gif'; }
  else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') { mimeType = 'image/webp'; signature = 'webp'; }
  else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') { mimeType = 'audio/wav'; signature = 'wav'; }
  else if (ascii(bytes, 0, 5) === '%PDF-') { mimeType = 'application/pdf'; signature = 'pdf'; }
  else if (starts(bytes, [0x50, 0x4b, 0x03, 0x04]) || starts(bytes, [0x50, 0x4b, 0x05, 0x06]) || starts(bytes, [0x50, 0x4b, 0x07, 0x08])) { mimeType = 'application/zip'; signature = 'zip'; }
  else if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') { mimeType = 'video/mp4'; signature = `iso-bmff:${ascii(bytes, 8, 4).trim() || 'unknown'}`; }
  else if (starts(bytes, [0x49, 0x44, 0x33]) || starts(bytes, [0xff, 0xfb]) || starts(bytes, [0xff, 0xf3]) || starts(bytes, [0xff, 0xf2])) { mimeType = 'audio/mpeg'; signature = 'mp3'; }
  else if (looksText(bytes)) { mimeType = 'text/plain'; signature = 'text'; }

  if (mimeType === 'image/png' && bytes.length < 24) corruptReason = 'PNG header is truncated';
  if (mimeType === 'application/pdf' && bytes.length < 8) corruptReason = 'PDF header is truncated';

  const extension = normalizeFileExtension(name);
  const allowed = mimeType ? MIME_EXTENSIONS[mimeType] : undefined;
  const extensionConsistent = !extension || !allowed ? undefined : allowed.includes(extension);

  return {
    mimeType,
    source: mimeType === 'text/plain' ? 'TEXT_HEURISTIC' : mimeType ? 'SIGNATURE' : 'UNKNOWN',
    signature,
    supported: Boolean(mimeType) && !corruptReason,
    extensionConsistent,
    corruptReason,
  };
}
