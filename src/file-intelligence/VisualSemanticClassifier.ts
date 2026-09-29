export type VisualAssetClass = 'PHOTO' | 'SCREENSHOT' | 'SCANNED_DOCUMENT' | 'ILLUSTRATION' | 'GRAPHIC' | 'UNKNOWN';
export type VisualSignalKind = 'ASSET_CLASS' | 'SCENE' | 'OBJECT' | 'TEXT_PRESENCE' | 'UI_PRESENCE';
export type VisualSignalSource = 'LOCAL_HEURISTIC' | 'LOCAL_MODEL' | 'EXTERNAL_MODEL';

export interface VisualSemanticSignal {
  kind: VisualSignalKind;
  label: string;
  confidence: number;
  source: VisualSignalSource;
  modelId?: string;
}

export interface VisualSemanticResult {
  assetClass: VisualAssetClass;
  assetClassConfidence: number;
  signals: VisualSemanticSignal[];
  summary?: string;
  analyzerVersion: string;
  externalProcessing: boolean;
}

export interface LocalVisualFeatures {
  width: number;
  height: number;
  hasAlpha?: boolean;
  edgeDensity?: number;
  colorVariance?: number;
  textRegionRatio?: number;
  uiRegionRatio?: number;
  photographicScore?: number;
}

const validConfidence = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;

export function validateVisualSemanticSignal(signal: VisualSemanticSignal): void {
  if (!signal.label.trim()) throw new Error('Visual semantic signal label is required');
  if (!validConfidence(signal.confidence)) throw new Error('Visual semantic confidence must be between 0 and 1');
  if ((signal.source === 'LOCAL_MODEL' || signal.source === 'EXTERNAL_MODEL') && !signal.modelId?.trim()) {
    throw new Error('Model-derived visual signals require modelId provenance');
  }
  if (signal.source === 'LOCAL_HEURISTIC' && signal.modelId) throw new Error('Local heuristic signal must not claim model provenance');
}

export function classifyLocalVisualFeatures(features: LocalVisualFeatures): VisualSemanticResult {
  const ratios = [features.edgeDensity, features.colorVariance, features.textRegionRatio, features.uiRegionRatio, features.photographicScore];
  if (!Number.isSafeInteger(features.width) || !Number.isSafeInteger(features.height) || features.width <= 0 || features.height <= 0) throw new Error('Visual dimensions must be positive integers');
  if (ratios.some((value) => value !== undefined && !validConfidence(value))) throw new Error('Local visual feature ratios must be between 0 and 1');

  let assetClass: VisualAssetClass = 'UNKNOWN';
  let confidence = 0.35;
  const text = features.textRegionRatio ?? 0;
  const ui = features.uiRegionRatio ?? 0;
  const photo = features.photographicScore ?? 0;
  const variance = features.colorVariance ?? 0;
  const edges = features.edgeDensity ?? 0;

  if (ui >= 0.55 && text >= 0.12) { assetClass = 'SCREENSHOT'; confidence = Math.min(0.95, 0.55 + ui * 0.3 + text * 0.15); }
  else if (text >= 0.55 && variance <= 0.35) { assetClass = 'SCANNED_DOCUMENT'; confidence = Math.min(0.93, 0.5 + text * 0.35 + (1 - variance) * 0.08); }
  else if (photo >= 0.72 && variance >= 0.35) { assetClass = 'PHOTO'; confidence = Math.min(0.94, 0.5 + photo * 0.35 + variance * 0.08); }
  else if (features.hasAlpha && edges >= 0.35 && variance >= 0.2) { assetClass = 'GRAPHIC'; confidence = Math.min(0.85, 0.48 + edges * 0.2 + variance * 0.12); }
  else if (edges >= 0.45 && photo < 0.5) { assetClass = 'ILLUSTRATION'; confidence = Math.min(0.82, 0.45 + edges * 0.25); }

  const signals: VisualSemanticSignal[] = [{
    kind: 'ASSET_CLASS',
    label: assetClass,
    confidence: Number(confidence.toFixed(4)),
    source: 'LOCAL_HEURISTIC',
  }];
  if (text >= 0.1) signals.push({ kind: 'TEXT_PRESENCE', label: 'text-visible', confidence: text, source: 'LOCAL_HEURISTIC' });
  if (ui >= 0.1) signals.push({ kind: 'UI_PRESENCE', label: 'ui-visible', confidence: ui, source: 'LOCAL_HEURISTIC' });

  return {
    assetClass,
    assetClassConfidence: Number(confidence.toFixed(4)),
    signals,
    analyzerVersion: 'mio-visual-heuristic-v1',
    externalProcessing: false,
  };
}

export function createModelVisualResult(input: Omit<VisualSemanticResult, 'externalProcessing'>, source: 'LOCAL_MODEL' | 'EXTERNAL_MODEL'): VisualSemanticResult {
  if (!validConfidence(input.assetClassConfidence)) throw new Error('Asset class confidence must be between 0 and 1');
  for (const signal of input.signals) {
    if (signal.source !== source) throw new Error('Visual result contains mixed or incorrect provenance');
    validateVisualSemanticSignal(signal);
  }
  return { ...input, externalProcessing: source === 'EXTERNAL_MODEL' };
}
