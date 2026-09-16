import { MioBenchDomain } from './MioBench';

export type MioModelTrainingMethod = 'BASE' | 'LORA' | 'QLORA' | 'MERGED_ADAPTER';
export type MioModelLifecycle = 'EXPERIMENTAL' | 'RELEASE_CANDIDATE' | 'PROMOTED' | 'RETIRED';

export interface MioModelPromotionProvenance {
  promoter: string;
  promotedAt: number;
  benchmarkReportId: string;
  integrityEvidenceId?: string;
}

export interface MioModelManifest {
  schemaVersion: 1;
  id: string;
  runtimeModel: string;
  displayName: string;
  baseModel: string;
  trainingMethod: MioModelTrainingMethod;
  adapterUri?: string;
  createdAt: number;
  dataset: {
    id: string;
    fingerprint: string;
    exampleCount: number;
  };
  benchmarkPolicy: {
    minPassRate: number;
    minScoreRatio: number;
    requiredDomains: MioBenchDomain[];
    maxAverageLatencyMs?: number;
  };
  review: {
    dataGovernanceReviewed: boolean;
    securityReviewed: boolean;
    reviewer?: string;
    reviewedAt?: number;
  };
  promotion?: MioModelPromotionProvenance;
  lifecycle: MioModelLifecycle;
  notes?: string;
}

export interface ModelManifestValidation {
  valid: boolean;
  errors: string[];
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
const SAFE_FINGERPRINT = /^[a-zA-Z0-9:_-]{8,256}$/;

export function validateModelManifest(manifest: MioModelManifest): ModelManifestValidation {
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1) errors.push('Unsupported model manifest schema');
  if (!SAFE_ID.test(manifest.id)) errors.push('Model manifest id is invalid');
  if (!manifest.runtimeModel.trim()) errors.push('runtimeModel is required');
  if (!manifest.displayName.trim()) errors.push('displayName is required');
  if (!manifest.baseModel.trim()) errors.push('baseModel is required');
  if (manifest.trainingMethod !== 'BASE' && !manifest.adapterUri?.trim()) errors.push('Adapter-based models require adapterUri');
  if (!SAFE_ID.test(manifest.dataset.id)) errors.push('Dataset id is invalid');
  if (!SAFE_FINGERPRINT.test(manifest.dataset.fingerprint)) errors.push('Dataset fingerprint is invalid');
  if (!Number.isInteger(manifest.dataset.exampleCount) || manifest.dataset.exampleCount < 1) errors.push('Dataset exampleCount must be a positive integer');
  if (manifest.benchmarkPolicy.minPassRate < 0 || manifest.benchmarkPolicy.minPassRate > 1) errors.push('minPassRate must be between 0 and 1');
  if (manifest.benchmarkPolicy.minScoreRatio < 0 || manifest.benchmarkPolicy.minScoreRatio > 1) errors.push('minScoreRatio must be between 0 and 1');
  if (manifest.benchmarkPolicy.requiredDomains.length === 0) errors.push('At least one required benchmark domain is required');
  if (manifest.benchmarkPolicy.maxAverageLatencyMs !== undefined && manifest.benchmarkPolicy.maxAverageLatencyMs <= 0) errors.push('maxAverageLatencyMs must be positive');
  if (manifest.promotion) {
    if (manifest.lifecycle !== 'PROMOTED') errors.push('Promotion provenance is only valid for PROMOTED model manifests');
    if (!manifest.promotion.promoter.trim() || manifest.promotion.promoter.length > 200) errors.push('Promotion provenance requires a bounded promoter identity');
    if (!Number.isFinite(manifest.promotion.promotedAt) || manifest.promotion.promotedAt <= 0) errors.push('Promotion provenance promotedAt is invalid');
    if (!manifest.promotion.benchmarkReportId.trim()) errors.push('Promotion provenance benchmarkReportId is required');
    if (manifest.promotion.integrityEvidenceId !== undefined && !manifest.promotion.integrityEvidenceId.trim()) errors.push('Promotion provenance integrityEvidenceId is invalid');
  }
  if (manifest.lifecycle === 'PROMOTED' && (!manifest.review.dataGovernanceReviewed || !manifest.review.securityReviewed)) {
    errors.push('Promoted models require data-governance and security review');
  }
  return { valid: errors.length === 0, errors };
}
