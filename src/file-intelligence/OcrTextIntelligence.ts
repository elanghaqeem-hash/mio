export type OcrSource = 'LOCAL_ENGINE' | 'EXTERNAL_ENGINE';

export interface OcrRegion {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrResult {
  text: string;
  regions: OcrRegion[];
  language?: string;
  languageConfidence?: number;
  source: OcrSource;
  engineId: string;
  externalProcessing: boolean;
  analyzerVersion: 'mio-ocr-contract-v1';
}

export interface OcrTextIndex {
  normalizedText: string;
  tokens: string[];
  uniqueTokens: string[];
  tokenCount: number;
  searchable: boolean;
}

const confidence = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;
const unit = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;

export function normalizeOcrText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function validateOcrResult(result: OcrResult): void {
  if (!result.engineId.trim()) throw new Error('OCR engineId provenance is required');
  if (result.externalProcessing !== (result.source === 'EXTERNAL_ENGINE')) throw new Error('OCR external-processing flag conflicts with source provenance');
  if (result.languageConfidence !== undefined && !confidence(result.languageConfidence)) throw new Error('OCR language confidence must be between 0 and 1');
  for (const region of result.regions) {
    if (!region.text.trim()) throw new Error('OCR region text is required');
    if (!confidence(region.confidence)) throw new Error('OCR region confidence must be between 0 and 1');
    if (![region.x, region.y, region.width, region.height].every(unit) || region.x + region.width > 1.000001 || region.y + region.height > 1.000001) {
      throw new Error('OCR region bounds must use normalized image coordinates');
    }
  }
}

export function createOcrResult(input: Omit<OcrResult, 'text' | 'externalProcessing' | 'analyzerVersion'> & { text?: string }): OcrResult {
  const regions = input.regions.map((region) => ({ ...region, text: normalizeOcrText(region.text) }));
  const text = normalizeOcrText(input.text ?? regions.map((region) => region.text).join(' '));
  const result: OcrResult = {
    ...input,
    text,
    regions,
    externalProcessing: input.source === 'EXTERNAL_ENGINE',
    analyzerVersion: 'mio-ocr-contract-v1',
  };
  validateOcrResult(result);
  return result;
}

export function buildOcrTextIndex(result: OcrResult): OcrTextIndex {
  validateOcrResult(result);
  const normalizedText = normalizeOcrText(result.text).toLocaleLowerCase(result.language || undefined);
  const tokens = normalizedText.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) ?? [];
  return {
    normalizedText,
    tokens,
    uniqueTokens: [...new Set(tokens)].sort((a, b) => a.localeCompare(b)),
    tokenCount: tokens.length,
    searchable: tokens.length > 0,
  };
}
