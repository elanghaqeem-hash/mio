import {
  classifyFileAsset,
  isVisualFileAsset,
  normalizeFileExtension,
  validateAnalysisConfidence,
} from '../file-intelligence/contracts';

interface SuiteResult { passed: number; total: number; }

export async function runFileIntelligenceContractTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`FileIntelligence contract test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  check(normalizeFileExtension('Photo.JPEG') === 'jpeg', 'Extension normalization is case-insensitive');
  check(normalizeFileExtension('.gitignore') === undefined, 'Dotfiles are not misclassified as extensions');
  check(classifyFileAsset('photo.jpg') === 'IMAGE', 'Image extension maps to IMAGE');
  check(classifyFileAsset('clip.mp4') === 'VIDEO', 'Video extension maps to VIDEO');
  check(classifyFileAsset('deck.pptx') === 'DOCUMENT', 'Office presentation maps to DOCUMENT');
  check(classifyFileAsset('model.glb') === 'THREE_D', '3D model maps to THREE_D');
  check(classifyFileAsset('unknown.mio') === 'UNKNOWN', 'Unknown extension remains UNKNOWN');
  check(classifyFileAsset('opaque.bin', 'image/webp') === 'IMAGE', 'Trusted MIME hint can classify an opaque filename');
  check(isVisualFileAsset('IMAGE') && isVisualFileAsset('VIDEO') && isVisualFileAsset('DOCUMENT'), 'Visual scan eligibility covers image, video, and document assets');
  check(!isVisualFileAsset('AUDIO') && !isVisualFileAsset('ARCHIVE'), 'Non-visual media is not routed into visual analysis');
  check(validateAnalysisConfidence(undefined) && validateAnalysisConfidence(0) && validateAnalysisConfidence(1), 'Confidence accepts absent and bounded values');
  check(!validateAnalysisConfidence(-0.01) && !validateAnalysisConfidence(1.01), 'Confidence rejects values outside 0..1');

  return { passed, total };
}
