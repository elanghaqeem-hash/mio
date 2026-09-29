import { inspectFileSignature } from '../file-intelligence/FileSignatureInspector';

interface SuiteResult { passed: number; total: number; }

export async function runFileSignatureInspectorTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`FileSignatureInspector test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const png = inspectFileSignature('photo.png', new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, ...new Array(20).fill(0)]));
  check(png.mimeType === 'image/png' && png.supported && png.extensionConsistent === true, 'PNG signature resolves MIME and matching extension');

  const disguised = inspectFileSignature('photo.jpg', new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, ...new Array(20).fill(0)]));
  check(disguised.mimeType === 'image/png' && disguised.extensionConsistent === false, 'Signature detects extension/content mismatch');

  const pdf = inspectFileSignature('report.pdf', new TextEncoder().encode('%PDF-1.7 sample'));
  check(pdf.mimeType === 'application/pdf' && pdf.signature === 'pdf', 'PDF signature is detected without parsing document content');

  const mp4 = inspectFileSignature('clip.mp4', new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]));
  check(mp4.mimeType === 'video/mp4' && mp4.supported, 'ISO-BMFF video signature is detected');

  const text = inspectFileSignature('notes.txt', new TextEncoder().encode('bounded plain text'));
  check(text.mimeType === 'text/plain' && text.source === 'TEXT_HEURISTIC', 'Text fallback uses bounded heuristic');

  const unknown = inspectFileSignature('blob.bin', new Uint8Array([0,1,2,3,4,5,6]));
  check(!unknown.supported && unknown.source === 'UNKNOWN', 'Unknown binary remains unsupported instead of being guessed');

  const truncatedPng = inspectFileSignature('broken.png', new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  check(!truncatedPng.supported && truncatedPng.corruptReason?.includes('truncated') === true, 'Truncated known header is flagged as corrupt');

  return { passed, total };
}
