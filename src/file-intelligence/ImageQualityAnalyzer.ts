export type ImageQualityFlag = 'UNDEREXPOSED' | 'OVEREXPOSED' | 'LOW_CONTRAST' | 'LIKELY_BLURRY' | 'SHADOW_CLIPPING' | 'HIGHLIGHT_CLIPPING';

export interface ImageQualityInput {
  meanLuminance: number;
  luminanceStdDev: number;
  sharpness: number;
  shadowClipRatio: number;
  highlightClipRatio: number;
}

export interface ImageQualityAssessment {
  exposure: 'UNDER' | 'BALANCED' | 'OVER';
  contrast: 'LOW' | 'NORMAL';
  sharpness: 'LOW' | 'NORMAL';
  flags: ImageQualityFlag[];
  measurements: ImageQualityInput;
  analyzerVersion: 'mio-image-quality-v1';
}

const unit = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= 1;

export function assessImageQuality(input: ImageQualityInput): ImageQualityAssessment {
  for (const [name, value] of Object.entries(input)) {
    if (!unit(value)) throw new Error(`${name} must be between 0 and 1`);
  }
  const flags: ImageQualityFlag[] = [];
  const exposure = input.meanLuminance < 0.18 ? 'UNDER' : input.meanLuminance > 0.82 ? 'OVER' : 'BALANCED';
  if (exposure === 'UNDER') flags.push('UNDEREXPOSED');
  if (exposure === 'OVER') flags.push('OVEREXPOSED');
  if (input.luminanceStdDev < 0.12) flags.push('LOW_CONTRAST');
  if (input.sharpness < 0.18) flags.push('LIKELY_BLURRY');
  if (input.shadowClipRatio >= 0.08) flags.push('SHADOW_CLIPPING');
  if (input.highlightClipRatio >= 0.08) flags.push('HIGHLIGHT_CLIPPING');
  return {
    exposure,
    contrast: input.luminanceStdDev < 0.12 ? 'LOW' : 'NORMAL',
    sharpness: input.sharpness < 0.18 ? 'LOW' : 'NORMAL',
    flags,
    measurements: { ...input },
    analyzerVersion: 'mio-image-quality-v1',
  };
}

export function measureGrayscaleQuality(pixels: Uint8Array, width: number, height: number): ImageQualityInput {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || pixels.length !== width * height) {
    throw new Error('Grayscale pixel buffer dimensions are invalid');
  }
  if (pixels.length > 4_194_304) throw new Error('Quality sample exceeds 4MP bounded analysis budget');

  let sum = 0, sumSq = 0, shadows = 0, highlights = 0, edgeSum = 0, edgeCount = 0;
  for (let i = 0; i < pixels.length; i += 1) {
    const v = pixels[i] / 255;
    sum += v; sumSq += v * v;
    if (pixels[i] <= 5) shadows += 1;
    if (pixels[i] >= 250) highlights += 1;
  }
  for (let y = 1; y < height; y += 1) for (let x = 1; x < width; x += 1) {
    const i = y * width + x;
    edgeSum += Math.abs(pixels[i] - pixels[i - 1]) + Math.abs(pixels[i] - pixels[i - width]);
    edgeCount += 2;
  }
  const mean = sum / pixels.length;
  const variance = Math.max(0, sumSq / pixels.length - mean * mean);
  return {
    meanLuminance: mean,
    luminanceStdDev: Math.min(1, Math.sqrt(variance)),
    sharpness: edgeCount ? Math.min(1, (edgeSum / edgeCount) / 64) : 0,
    shadowClipRatio: shadows / pixels.length,
    highlightClipRatio: highlights / pixels.length,
  };
}
