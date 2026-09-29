export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ExifOrientationResult {
  orientation: ExifOrientation;
  rotationDegrees: 0 | 90 | 180 | 270;
  mirrored: boolean;
  swapsDimensions: boolean;
}

const u16 = (b: Uint8Array, o: number, le: boolean): number =>
  le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];

const u32 = (b: Uint8Array, o: number, le: boolean): number =>
  le
    ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] * 0x1000000)) >>> 0
    : ((b[o] * 0x1000000) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]) >>> 0;

export function normalizeExifOrientation(orientation: ExifOrientation): ExifOrientationResult {
  const rotationDegrees: ExifOrientationResult['rotationDegrees'] =
    orientation === 3 || orientation === 4 ? 180 :
    orientation === 5 || orientation === 6 ? 90 :
    orientation === 7 || orientation === 8 ? 270 : 0;
  return {
    orientation,
    rotationDegrees,
    mirrored: orientation === 2 || orientation === 4 || orientation === 5 || orientation === 7,
    swapsDimensions: orientation >= 5,
  };
}

export function inspectJpegExifOrientation(bytes: Uint8Array): ExifOrientationResult | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = u16(bytes, offset + 2, false);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1 && length >= 16) {
      const exif = offset + 4;
      if (String.fromCharCode(...bytes.slice(exif, exif + 6)) !== 'Exif\0\0') { offset += 2 + length; continue; }
      const tiff = exif + 6;
      const order = String.fromCharCode(bytes[tiff], bytes[tiff + 1]);
      const le = order === 'II';
      if (!le && order !== 'MM') return undefined;
      if (u16(bytes, tiff + 2, le) !== 42) return undefined;
      const ifd = tiff + u32(bytes, tiff + 4, le);
      if (ifd + 2 > bytes.length) return undefined;
      const count = u16(bytes, ifd, le);
      for (let i = 0; i < count; i += 1) {
        const entry = ifd + 2 + (i * 12);
        if (entry + 12 > bytes.length) return undefined;
        if (u16(bytes, entry, le) !== 0x0112) continue;
        const value = u16(bytes, entry + 8, le);
        if (value >= 1 && value <= 8) return normalizeExifOrientation(value as ExifOrientation);
        return undefined;
      }
    }
    offset += 2 + length;
  }
  return undefined;
}

export function displayDimensions(width: number, height: number, exif?: ExifOrientationResult): { width: number; height: number } {
  return exif?.swapsDimensions ? { width: height, height: width } : { width, height };
}
