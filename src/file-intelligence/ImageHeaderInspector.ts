export type ImageOrientation = 'LANDSCAPE' | 'PORTRAIT' | 'SQUARE';

export interface ImageTechnicalMetadata {
  width: number;
  height: number;
  megapixels: number;
  aspectRatio: number;
  orientation: ImageOrientation;
  animated?: boolean;
  frameCount?: number;
  hasAlpha?: boolean;
  bitDepth?: number;
  colorModel?: 'GRAYSCALE' | 'RGB' | 'RGBA' | 'INDEXED' | 'UNKNOWN';
}

export interface ImageQualitySignals {
  resolutionClass: 'TINY' | 'LOW' | 'STANDARD' | 'HIGH' | 'ULTRA';
  unusuallyWide: boolean;
  unusuallyTall: boolean;
  likelyThumbnail: boolean;
}

export interface ImageInspectionResult {
  mimeType: 'image/png' | 'image/gif' | 'image/jpeg';
  technical: ImageTechnicalMetadata;
  quality: ImageQualitySignals;
  analyzerVersion: 'mio-image-header-v1';
}

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) => ((b[o] * 0x1000000) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]) >>> 0;
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);

const quality = (width: number, height: number): ImageQualitySignals => {
  const longest = Math.max(width, height);
  const shortest = Math.min(width, height);
  return {
    resolutionClass: longest < 256 ? 'TINY' : longest < 720 ? 'LOW' : longest < 2160 ? 'STANDARD' : longest < 4320 ? 'HIGH' : 'ULTRA',
    unusuallyWide: width / height >= 3,
    unusuallyTall: height / width >= 3,
    likelyThumbnail: longest <= 512,
  };
};

const technical = (width: number, height: number, extra: Partial<ImageTechnicalMetadata> = {}): ImageTechnicalMetadata => ({
  width,
  height,
  megapixels: Number(((width * height) / 1_000_000).toFixed(3)),
  aspectRatio: Number((width / height).toFixed(4)),
  orientation: width === height ? 'SQUARE' : width > height ? 'LANDSCAPE' : 'PORTRAIT',
  ...extra,
});

export function inspectImageHeader(bytes: Uint8Array): ImageInspectionResult {
  if (bytes.length >= 24 && bytes[0] === 0x89 && String.fromCharCode(...bytes.slice(1, 4)) === 'PNG') {
    const width = u32be(bytes, 16), height = u32be(bytes, 20);
    if (!width || !height) throw new Error('Invalid PNG dimensions');
    const bitDepth = bytes[24];
    const colorType = bytes[25];
    const models: Record<number, ImageTechnicalMetadata['colorModel']> = { 0: 'GRAYSCALE', 2: 'RGB', 3: 'INDEXED', 4: 'RGBA', 6: 'RGBA' };
    return { mimeType: 'image/png', technical: technical(width, height, { bitDepth, colorModel: models[colorType] ?? 'UNKNOWN', hasAlpha: colorType === 4 || colorType === 6 }), quality: quality(width, height), analyzerVersion: 'mio-image-header-v1' };
  }

  if (bytes.length >= 10 && (String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a' || String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a')) {
    const width = u16le(bytes, 6), height = u16le(bytes, 8);
    if (!width || !height) throw new Error('Invalid GIF dimensions');
    return { mimeType: 'image/gif', technical: technical(width, height, { colorModel: 'INDEXED' }), quality: quality(width, height), analyzerVersion: 'mio-image-header-v1' };
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      if (offset + 4 > bytes.length) break;
      const length = u16be(bytes, offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        const bitDepth = bytes[offset + 4], height = u16be(bytes, offset + 5), width = u16be(bytes, offset + 7);
        if (!width || !height) throw new Error('Invalid JPEG dimensions');
        return { mimeType: 'image/jpeg', technical: technical(width, height, { bitDepth, colorModel: 'RGB' }), quality: quality(width, height), analyzerVersion: 'mio-image-header-v1' };
      }
      offset += 2 + length;
    }
    throw new Error('JPEG dimensions not found within bounded header');
  }

  throw new Error('Unsupported image header');
}
