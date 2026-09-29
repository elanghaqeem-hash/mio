import { buildOcrTextIndex, createOcrResult, validateOcrResult } from '../file-intelligence/OcrTextIntelligence';

interface SuiteResult { passed: number; total: number; }

export async function runOcrTextIntelligenceTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`OcrTextIntelligence test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const local = createOcrResult({
    source: 'LOCAL_ENGINE',
    engineId: 'local-ocr/v1',
    language: 'id',
    languageConfidence: 0.94,
    regions: [
      { text: '  Riset   Teknologi ', confidence: 0.97, x: 0.1, y: 0.1, width: 0.4, height: 0.08 },
      { text: 'Indonesia 2026', confidence: 0.95, x: 0.1, y: 0.2, width: 0.35, height: 0.08 },
    ],
  });
  check(local.text === 'Riset Teknologi Indonesia 2026' && !local.externalProcessing, 'Local OCR regions normalize into canonical text without external-processing flag');

  const index = buildOcrTextIndex(local);
  check(index.tokens.join(',') === 'riset,teknologi,indonesia,2026' && index.tokenCount === 4, 'OCR text builds Unicode-aware searchable token index');
  check(index.uniqueTokens.length === 4 && index.searchable, 'OCR index exposes deterministic unique tokens');

  const external = createOcrResult({
    text: 'Invoice 123',
    source: 'EXTERNAL_ENGINE',
    engineId: 'provider/ocr-v2',
    regions: [{ text: 'Invoice 123', confidence: 0.9, x: 0, y: 0, width: 1, height: 0.2 }],
  });
  check(external.externalProcessing && external.engineId === 'provider/ocr-v2', 'External OCR is explicitly marked with engine provenance');

  let invalidBounds = false;
  try {
    createOcrResult({ source: 'LOCAL_ENGINE', engineId: 'local', regions: [{ text: 'bad', confidence: 0.8, x: 0.8, y: 0, width: 0.4, height: 0.2 }] });
  } catch { invalidBounds = true; }
  check(invalidBounds, 'OCR regions outside normalized image bounds are rejected');

  let invalidProvenance = false;
  try {
    validateOcrResult({ text: 'x', regions: [], source: 'EXTERNAL_ENGINE', engineId: '', externalProcessing: true, analyzerVersion: 'mio-ocr-contract-v1' });
  } catch { invalidProvenance = true; }
  check(invalidProvenance, 'OCR result without engine provenance is rejected');

  return { passed, total };
}
