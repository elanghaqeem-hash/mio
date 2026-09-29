import { classifyLocalVisualFeatures, createModelVisualResult, validateVisualSemanticSignal } from '../file-intelligence/VisualSemanticClassifier';

interface SuiteResult { passed: number; total: number; }

export async function runVisualSemanticClassifierTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`VisualSemanticClassifier test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const screenshot = classifyLocalVisualFeatures({ width: 1440, height: 900, textRegionRatio: 0.28, uiRegionRatio: 0.78, colorVariance: 0.3 });
  check(screenshot.assetClass === 'SCREENSHOT' && !screenshot.externalProcessing, 'UI/text-heavy image is locally classified as screenshot');
  check(screenshot.signals.every((signal) => signal.source === 'LOCAL_HEURISTIC'), 'Heuristic classification exposes provenance on every signal');

  const scan = classifyLocalVisualFeatures({ width: 2480, height: 3508, textRegionRatio: 0.82, uiRegionRatio: 0.02, colorVariance: 0.12 });
  check(scan.assetClass === 'SCANNED_DOCUMENT', 'Text-dense low-variance image is classified as scanned document');

  const photo = classifyLocalVisualFeatures({ width: 4032, height: 3024, photographicScore: 0.9, colorVariance: 0.7, edgeDensity: 0.3 });
  check(photo.assetClass === 'PHOTO', 'Photographic local features classify photo without external model');

  const graphic = classifyLocalVisualFeatures({ width: 1200, height: 1200, hasAlpha: true, edgeDensity: 0.6, colorVariance: 0.55, photographicScore: 0.2 });
  check(graphic.assetClass === 'GRAPHIC', 'Alpha/edge-rich visual can classify as graphic');

  let provenanceRejected = false;
  try { validateVisualSemanticSignal({ kind: 'OBJECT', label: 'car', confidence: 0.9, source: 'EXTERNAL_MODEL' }); } catch { provenanceRejected = true; }
  check(provenanceRejected, 'Model-derived signal without modelId provenance is rejected');

  const model = createModelVisualResult({
    assetClass: 'PHOTO',
    assetClassConfidence: 0.91,
    analyzerVersion: 'vision-adapter-v1',
    signals: [{ kind: 'SCENE', label: 'street', confidence: 0.88, source: 'EXTERNAL_MODEL', modelId: 'provider/model' }],
  }, 'EXTERNAL_MODEL');
  check(model.externalProcessing && model.signals[0].modelId === 'provider/model', 'External model result is explicitly marked external with model provenance');

  let mixedRejected = false;
  try {
    createModelVisualResult({
      assetClass: 'PHOTO', assetClassConfidence: 0.8, analyzerVersion: 'bad',
      signals: [{ kind: 'SCENE', label: 'park', confidence: 0.8, source: 'LOCAL_MODEL', modelId: 'local/v1' }],
    }, 'EXTERNAL_MODEL');
  } catch { mixedRejected = true; }
  check(mixedRejected, 'Mixed provenance cannot masquerade as one semantic result');

  return { passed, total };
}
