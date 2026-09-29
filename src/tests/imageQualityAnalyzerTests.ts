import { assessImageQuality, measureGrayscaleQuality } from '../file-intelligence/ImageQualityAnalyzer';

interface SuiteResult { passed: number; total: number; }

export async function runImageQualityAnalyzerTests(): Promise<SuiteResult> {
  let passed = 0, total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`ImageQualityAnalyzer test failed: ${label}`);
    passed += 1; console.log(`✓ [PASS] ${label}`);
  };

  const dark = assessImageQuality({ meanLuminance: 0.1, luminanceStdDev: 0.2, sharpness: 0.5, shadowClipRatio: 0.12, highlightClipRatio: 0 });
  check(dark.exposure === 'UNDER' && dark.flags.includes('UNDEREXPOSED') && dark.flags.includes('SHADOW_CLIPPING'), 'Dark clipped image receives underexposure and shadow-clipping flags');

  const bright = assessImageQuality({ meanLuminance: 0.9, luminanceStdDev: 0.2, sharpness: 0.5, shadowClipRatio: 0, highlightClipRatio: 0.1 });
  check(bright.exposure === 'OVER' && bright.flags.includes('HIGHLIGHT_CLIPPING'), 'Bright clipped image receives overexposure/highlight flags');

  const flatBlur = assessImageQuality({ meanLuminance: 0.5, luminanceStdDev: 0.05, sharpness: 0.05, shadowClipRatio: 0, highlightClipRatio: 0 });
  check(flatBlur.contrast === 'LOW' && flatBlur.sharpness === 'LOW' && flatBlur.flags.includes('LIKELY_BLURRY'), 'Low-contrast low-sharpness image is flagged without aesthetic scoring');

  const checker = new Uint8Array([0,255,0,255, 255,0,255,0, 0,255,0,255, 255,0,255,0]);
  const measured = measureGrayscaleQuality(checker, 4, 4);
  check(measured.sharpness > 0.9 && measured.meanLuminance === 0.5, 'Pixel sample derives normalized luminance and strong edge sharpness');

  let invalid = false;
  try { assessImageQuality({ meanLuminance: 2, luminanceStdDev: 0, sharpness: 0, shadowClipRatio: 0, highlightClipRatio: 0 }); } catch { invalid = true; }
  check(invalid, 'Out-of-range quality measurements are rejected');

  return { passed, total };
}
