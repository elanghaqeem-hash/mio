import { inspectImageHeader } from '../file-intelligence/ImageHeaderInspector';

interface SuiteResult { passed: number; total: number; }

export async function runImageHeaderInspectorTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`ImageHeaderInspector test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const png = new Uint8Array(26);
  png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], 0);
  png.set([0,0,0,13,0x49,0x48,0x44,0x52], 8);
  png.set([0,0,7,128,0,0,4,56,8,6], 16);
  const pngResult = inspectImageHeader(png);
  check(pngResult.technical.width === 1920 && pngResult.technical.height === 1080, 'PNG IHDR dimensions are parsed locally');
  check(pngResult.technical.orientation === 'LANDSCAPE' && pngResult.technical.hasAlpha === true, 'PNG orientation and alpha metadata are derived');
  check(pngResult.quality.resolutionClass === 'STANDARD' && !pngResult.quality.likelyThumbnail, 'Resolution quality signals are deterministic');

  const gif = new Uint8Array([0x47,0x49,0x46,0x38,0x39,0x61,0x00,0x02,0x00,0x02]);
  const gifResult = inspectImageHeader(gif);
  check(gifResult.technical.width === 512 && gifResult.technical.height === 512 && gifResult.technical.orientation === 'SQUARE', 'GIF logical screen dimensions are parsed');

  const jpeg = new Uint8Array([0xff,0xd8,0xff,0xc0,0x00,0x11,0x08,0x04,0x38,0x07,0x80,0x03,0x01,0x11,0,0x02,0x11,0,0x03,0x11,0]);
  const jpegResult = inspectImageHeader(jpeg);
  check(jpegResult.technical.width === 1920 && jpegResult.technical.height === 1080, 'JPEG SOF dimensions are parsed from bounded bytes');

  let unsupported = false;
  try { inspectImageHeader(new Uint8Array([0,1,2,3])); } catch { unsupported = true; }
  check(unsupported, 'Unknown image bytes are rejected instead of guessed');

  return { passed, total };
}
