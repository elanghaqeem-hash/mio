import { displayDimensions, inspectJpegExifOrientation, normalizeExifOrientation } from '../file-intelligence/ExifOrientation';
import { planImagePreview } from '../file-intelligence/ImagePreviewPolicy';

interface SuiteResult { passed: number; total: number; }

export async function runImagePreviewOrientationTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`ImagePreviewOrientation test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const preview = planImagePreview(4000, 3000, { maxWidth: 512, maxHeight: 512 });
  check(preview.targetWidth === 512 && preview.targetHeight === 384 && preview.localOnly, 'Preview plan preserves aspect ratio and remains local-only');
  const noUpscale = planImagePreview(200, 100, { maxWidth: 512, maxHeight: 512 });
  check(noUpscale.targetWidth === 200 && noUpscale.targetHeight === 100, 'Preview does not upscale by default');

  let rejected = false;
  try { planImagePreview(20000, 10000, { maxWidth: 512, maxHeight: 512 }); } catch { rejected = true; }
  check(rejected, 'Preview rejects source images above pixel safety budget');

  const rotated = normalizeExifOrientation(6);
  check(rotated.rotationDegrees === 90 && rotated.swapsDimensions && !rotated.mirrored, 'EXIF orientation 6 normalizes to 90-degree display rotation');
  const mirrored = normalizeExifOrientation(2);
  check(mirrored.mirrored && mirrored.rotationDegrees === 0, 'Mirrored EXIF orientation is preserved explicitly');
  const dimensions = displayDimensions(4032, 3024, rotated);
  check(dimensions.width === 3024 && dimensions.height === 4032, 'Display dimensions swap for rotated EXIF orientations');

  const exif = new Uint8Array([
    0xff,0xd8, 0xff,0xe1, 0x00,0x22,
    0x45,0x78,0x69,0x66,0x00,0x00,
    0x49,0x49,0x2a,0x00, 0x08,0x00,0x00,0x00,
    0x01,0x00,
    0x12,0x01, 0x03,0x00, 0x01,0x00,0x00,0x00, 0x06,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,
  ]);
  const parsed = inspectJpegExifOrientation(exif);
  check(parsed?.orientation === 6 && parsed.rotationDegrees === 90, 'JPEG APP1 EXIF orientation is parsed from bounded bytes');

  return { passed, total };
}
