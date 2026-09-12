import { ProjectManager } from '../project/ProjectManager';
import { PolicyEngine } from '../security/PolicyEngine';
import type { MioProject, ProjectAsset } from '../types/project';
import type { ResearchReport, ResearchSource } from '../types/research';

export type RevalidationQueuePriority = 'CRITICAL' | 'HIGH' | 'NORMAL';
export type RevalidationDecision = 'KEEP_EXISTING' | 'UPDATE_METADATA' | 'ACCEPT_VARIANCE' | 'SUPERSEDE';

export interface RevalidationQueueItem {
  assetId: string;
  assetName: string;
  sourceUrl: string;
  advisory: string;
  freshness: 'CURRENT' | 'STALE' | 'UNKNOWN';
  priority: RevalidationQueuePriority;
  reason: string;
}

export interface RevalidationComparison {
  assetId: string;
  sourceId: string;
  sourceUrl: string;
  contentChanged: boolean;
  similarity: number;
  oldContent: string;
  candidateContent: string;
  metadataChanges: string[];
  candidateTrust: 'QUARANTINED';
  candidateFreshness: 'UNKNOWN';
  suspicious: boolean;
  detectedThreats: string[];
  method: 'BOUNDED_TEXT_AND_METADATA_DIFF';
}

export type RevalidationApplyResult =
  | { status: 'APPLIED'; decision: RevalidationDecision; asset: ProjectAsset; replacementAsset?: ProjectAsset }
  | { status: 'NOT_FOUND'; assetId: string }
  | { status: 'INVALID_CANDIDATE'; sourceId: string };

function activeResearchAssets(project: MioProject): ProjectAsset[] {
  return project.assets.filter((asset) => {
    if (asset.type !== 'document' || !asset.data?.researchProvenance) return false;
    const record = project.knowledgeGovernance.sources[asset.id];
    return record?.included !== false && !record?.supersededByAssetId;
  });
}

function freshness(project: MioProject, assetId: string): 'CURRENT' | 'STALE' | 'UNKNOWN' {
  const freshUntil = project.knowledgeGovernance.sources[assetId]?.freshUntil;
  if (!freshUntil) return 'UNKNOWN';
  return freshUntil >= Date.now() ? 'CURRENT' : 'STALE';
}

function queuePriority(advisory: string, sourceFreshness: 'CURRENT' | 'STALE' | 'UNKNOWN'): RevalidationQueuePriority {
  if (advisory === 'REVALIDATE_NOW' || sourceFreshness === 'STALE') return 'CRITICAL';
  if (advisory === 'REVALIDATE_BEFORE_CRITICAL_USE' || sourceFreshness === 'UNKNOWN') return 'HIGH';
  return 'NORMAL';
}

function terms(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? []).slice(0, 500));
}

function similarity(left: string, right: string): number {
  const a = terms(left);
  const b = terms(right);
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : Math.round((intersection / union) * 1000) / 1000;
}

function safeAssetName(title: string): string {
  const normalized = title.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Research Refresh';
  return `${normalized}.revalidated.research.md`;
}

function metadataChanges(asset: ProjectAsset, source: ResearchSource): string[] {
  const previous = asset.data?.researchProvenance ?? {};
  const changes: string[] = [];
  if (previous.sourceUrl !== source.url) changes.push('sourceUrl');
  if (previous.publishedAt !== source.publishedAt) changes.push('publishedAt');
  if (previous.reliability !== source.reliability) changes.push('reliability');
  if (previous.reliabilityScore !== source.reliabilityScore) changes.push('reliabilityScore');
  if (previous.epistemicStatus !== source.status) changes.push('epistemicStatus');
  if (previous.citationLabel !== source.citationLabel) changes.push('citationLabel');
  return changes;
}

function appendHistory(asset: ProjectAsset, decision: RevalidationDecision, comparison: RevalidationComparison): any {
  const existing = Array.isArray(asset.data?.revalidationHistory) ? asset.data.revalidationHistory : [];
  return [
    {
      decision,
      at: Date.now(),
      sourceId: comparison.sourceId,
      sourceUrl: comparison.sourceUrl,
      contentChanged: comparison.contentChanged,
      similarity: comparison.similarity,
      metadataChanges: comparison.metadataChanges,
      suspicious: comparison.suspicious,
      method: comparison.method,
    },
    ...existing,
  ].slice(0, 100);
}

function replacementAsset(source: ResearchSource, report: ResearchReport, comparison: RevalidationComparison, varianceWithAssetId?: string): ProjectAsset {
  const sourceSafety = PolicyEngine.sanitizeExternalContent(source.sanitizedExcerpt || source.excerpt, `research-revalidation:${source.url}`);
  return ProjectManager.addAsset({
    name: safeAssetName(source.title),
    type: 'document',
    origin: 'IMPORTED',
    filePath: `research-refresh://${encodeURIComponent(source.provider)}/${encodeURIComponent(source.providerSourceId)}/${Date.now()}`,
    data: {
      content: sourceSafety.sanitized,
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
        revalidationCandidate: true,
        varianceWithAssetId,
      },
      security: {
        externalUntrustedData: true,
        suspicious: comparison.suspicious,
        detectedThreats: comparison.detectedThreats,
      },
      revalidationAdvisory: {
        status: 'REVIEW_RECOMMENDED',
        reason: 'Fresh research candidate was explicitly captured during controlled revalidation; user review is still required.',
        method: 'CONTROLLED_REVALIDATION',
      },
      revalidationHistory: [{ decision: varianceWithAssetId ? 'ACCEPT_VARIANCE' : 'SUPERSEDE', at: Date.now(), sourceId: source.id, sourceUrl: source.url, method: comparison.method }],
    },
    verified: false,
    notes: 'Created from explicit research revalidation. Trust remains QUARANTINED and freshness remains UNKNOWN until separately reviewed.',
  });
}

export class ResearchRevalidation {
  public static queue(project: MioProject = ProjectManager.getProject()): RevalidationQueueItem[] {
    return activeResearchAssets(project)
      .map((asset) => {
        const sourceFreshness = freshness(project, asset.id);
        const advisory = String(asset.data?.revalidationAdvisory?.status ?? 'REVIEW_RECOMMENDED');
        const priority = queuePriority(advisory, sourceFreshness);
        const reason = sourceFreshness === 'STALE'
          ? 'Governance freshness horizon has expired.'
          : sourceFreshness === 'UNKNOWN'
            ? 'No verified freshness horizon exists for this source.'
            : String(asset.data?.revalidationAdvisory?.reason ?? 'Periodic review recommended.');
        return {
          assetId: asset.id,
          assetName: asset.name,
          sourceUrl: String(asset.data.researchProvenance.sourceUrl ?? ''),
          advisory,
          freshness: sourceFreshness,
          priority,
          reason,
        };
      })
      .sort((a, b) => ({ CRITICAL: 0, HIGH: 1, NORMAL: 2 }[a.priority] - ({ CRITICAL: 0, HIGH: 1, NORMAL: 2 }[b.priority]));
  }

  public static compare(assetId: string, report: ResearchReport, sourceId: string): RevalidationComparison | null {
    const asset = ProjectManager.getProject().assets.find((item) => item.id === assetId && item.type === 'document' && item.data?.researchProvenance);
    const source = report.sources.find((item) => item.id === sourceId);
    if (!asset || !source) return null;
    const safety = PolicyEngine.sanitizeExternalContent(source.sanitizedExcerpt || source.excerpt, `research-revalidation:${source.url}`);
    const oldContent = String(asset.data?.content ?? '');
    const candidateContent = safety.sanitized;
    const score = similarity(oldContent, candidateContent);
    return {
      assetId,
      sourceId,
      sourceUrl: source.url,
      contentChanged: oldContent.trim() !== candidateContent.trim(),
      similarity: score,
      oldContent,
      candidateContent,
      metadataChanges: metadataChanges(asset, source),
      candidateTrust: 'QUARANTINED',
      candidateFreshness: 'UNKNOWN',
      suspicious: source.suspicious || safety.suspicious,
      detectedThreats: [...new Set([...(source.detectedThreats ?? []), ...safety.detectedThreats])],
      method: 'BOUNDED_TEXT_AND_METADATA_DIFF',
    };
  }

  public static apply(assetId: string, report: ResearchReport, sourceId: string, decision: RevalidationDecision): RevalidationApplyResult {
    const project = ProjectManager.getProject();
    const asset = project.assets.find((item) => item.id === assetId && item.type === 'document' && item.data?.researchProvenance);
    if (!asset) return { status: 'NOT_FOUND', assetId };
    const source = report.sources.find((item) => item.id === sourceId);
    const comparison = this.compare(assetId, report, sourceId);
    if (!source || !comparison) return { status: 'INVALID_CANDIDATE', sourceId };

    if (decision === 'KEEP_EXISTING') {
      ProjectManager.updateAssetData(asset.id, { ...asset.data, revalidationHistory: appendHistory(asset, decision, comparison) }, asset.origin);
      return { status: 'APPLIED', decision, asset: ProjectManager.getProject().assets.find((item) => item.id === asset.id)! };
    }

    if (decision === 'UPDATE_METADATA') {
      const provenance = asset.data?.researchProvenance ?? {};
      ProjectManager.updateAssetData(asset.id, {
        ...asset.data,
        researchProvenance: {
          ...provenance,
          latestCheckedSourceId: source.id,
          latestCheckedUrl: source.url,
          latestCheckedPublishedAt: source.publishedAt,
          latestCheckedReliability: source.reliability,
          latestCheckedReliabilityScore: source.reliabilityScore,
          latestCheckedEpistemicStatus: source.status,
          metadataCheckedAt: Date.now(),
        },
        revalidationHistory: appendHistory(asset, decision, comparison),
      }, asset.origin);
      return { status: 'APPLIED', decision, asset: ProjectManager.getProject().assets.find((item) => item.id === asset.id)! };
    }

    if (decision === 'ACCEPT_VARIANCE') {
      const replacement = replacementAsset(source, report, comparison, asset.id);
      ProjectManager.updateAssetData(asset.id, { ...asset.data, revalidationHistory: appendHistory(asset, decision, comparison) }, asset.origin);
      return { status: 'APPLIED', decision, asset: ProjectManager.getProject().assets.find((item) => item.id === asset.id)!, replacementAsset: replacement };
    }

    const replacement = replacementAsset(source, report, comparison);
    ProjectManager.supersedeKnowledgeSource(asset.id, replacement.id);
    return { status: 'APPLIED', decision, asset: ProjectManager.getProject().assets.find((item) => item.id === asset.id)!, replacementAsset: replacement };
  }
}
