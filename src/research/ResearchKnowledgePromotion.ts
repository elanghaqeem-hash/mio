import { PolicyEngine } from '../security/PolicyEngine';
import { ProjectManager } from '../project/ProjectManager';
import type { ProjectAsset } from '../types/project';
import type { ResearchReport, ResearchSource } from '../types/research';

export type ResearchRevalidationAdvisory = 'REVALIDATE_NOW' | 'REVALIDATE_BEFORE_CRITICAL_USE' | 'REVIEW_RECOMMENDED';

export interface ResearchPromotionPreview {
  sourceId: string;
  title: string;
  sourceUri: string;
  sanitizedText: string;
  suspicious: boolean;
  detectedThreats: string[];
  initialTrust: 'QUARANTINED';
  initialFreshness: 'UNKNOWN';
  advisory: ResearchRevalidationAdvisory;
  advisoryReason: string;
  method: 'DATE_AND_INTENT_ADVISORY';
}

export type ResearchPromotionResult =
  | { status: 'PROMOTED'; asset: ProjectAsset; preview: ResearchPromotionPreview }
  | { status: 'ALREADY_PROMOTED'; asset: ProjectAsset; preview: ResearchPromotionPreview }
  | { status: 'NOT_FOUND'; sourceId: string };

function ageDays(publishedAt?: string): number | null {
  if (!publishedAt) return null;
  const timestamp = Date.parse(publishedAt);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function advisoryFor(source: ResearchSource, report: ResearchReport): Pick<ResearchPromotionPreview, 'advisory' | 'advisoryReason'> {
  const age = ageDays(source.publishedAt);
  const currentIntent = report.query.intents.includes('CURRENT');
  if (age === null) {
    return { advisory: 'REVALIDATE_BEFORE_CRITICAL_USE', advisoryReason: 'Source publication date is unavailable; freshness cannot be established automatically.' };
  }
  if (currentIntent && age > 30) {
    return { advisory: 'REVALIDATE_NOW', advisoryReason: `Current-information query uses a source approximately ${age} days old.` };
  }
  if (age > 365) {
    return { advisory: 'REVALIDATE_BEFORE_CRITICAL_USE', advisoryReason: `Source is approximately ${age} days old; applicability may have changed.` };
  }
  return { advisory: 'REVIEW_RECOMMENDED', advisoryReason: `Source age is approximately ${age} days; manual review remains required before verification.` };
}

function safeAssetName(title: string): string {
  const normalized = title.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Research Source';
  return `${normalized}.research.md`;
}

export class ResearchKnowledgePromotion {
  public static preview(source: ResearchSource, report: ResearchReport): ResearchPromotionPreview {
    const safety = PolicyEngine.sanitizeExternalContent(source.sanitizedExcerpt || source.excerpt, `research-promotion:${source.url}`);
    return {
      sourceId: source.id,
      title: source.title,
      sourceUri: source.url,
      sanitizedText: safety.sanitized,
      suspicious: source.suspicious || safety.suspicious,
      detectedThreats: [...new Set([...(source.detectedThreats ?? []), ...safety.detectedThreats])],
      initialTrust: 'QUARANTINED',
      initialFreshness: 'UNKNOWN',
      ...advisoryFor(source, report),
      method: 'DATE_AND_INTENT_ADVISORY',
    };
  }

  public static promote(report: ResearchReport, sourceId: string): ResearchPromotionResult {
    const source = report.sources.find((item) => item.id === sourceId);
    if (!source) return { status: 'NOT_FOUND', sourceId };
    const preview = this.preview(source, report);
    const project = ProjectManager.getProject();
    const existing = project.assets.find((asset) => asset.type === 'document' && asset.data?.researchProvenance?.sourceUrl === source.url);
    if (existing) return { status: 'ALREADY_PROMOTED', asset: existing, preview };

    const asset = ProjectManager.addAsset({
      name: safeAssetName(source.title),
      type: 'document',
      origin: 'IMPORTED',
      filePath: `research://${encodeURIComponent(source.provider)}/${encodeURIComponent(source.providerSourceId)}`,
      data: {
        content: preview.sanitizedText,
        quarantine: true,
        researchProvenance: {
          reportQuery: report.query.originalQuery,
          normalizedQuery: report.query.normalizedQuery,
          sourceId: source.id,
          provider: source.provider,
          providerSourceId: source.providerSourceId,
          sourceUrl: source.url,
          citationLabel: source.citationLabel,
          sourceType: source.sourceType,
          publishedAt: source.publishedAt,
          reliability: source.reliability,
          reliabilityScore: source.reliabilityScore,
          epistemicStatus: source.status,
          promotedAt: Date.now(),
        },
        security: {
          externalUntrustedData: true,
          suspicious: preview.suspicious,
          detectedThreats: preview.detectedThreats,
        },
        revalidationAdvisory: {
          status: preview.advisory,
          reason: preview.advisoryReason,
          method: preview.method,
        },
      },
      verified: false,
      notes: `Explicitly promoted from MIO Research. Initial governance trust remains QUARANTINED. ${preview.advisory}: ${preview.advisoryReason}`,
    });

    return { status: 'PROMOTED', asset, preview };
  }
}
