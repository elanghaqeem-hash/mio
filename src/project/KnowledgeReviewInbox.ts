import type { MioProject, ProjectAsset } from '../types/project';
import { KnowledgeHealth } from './KnowledgeHealth';

export type KnowledgeReviewSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type KnowledgeReviewReason = 'QUARANTINED' | 'STALE' | 'UNKNOWN_FRESHNESS' | 'REVALIDATION_DUE' | 'SUSPICIOUS_CONTENT' | 'OPEN_CONFLICT';

export interface KnowledgeReviewInboxItem {
  assetId: string;
  assetName: string;
  severity: KnowledgeReviewSeverity;
  reasons: KnowledgeReviewReason[];
  trust: 'VERIFIED' | 'QUARANTINED';
  freshness: 'CURRENT' | 'STALE' | 'UNKNOWN';
  sourceUri: string;
  summary: string;
}

export type KnowledgeTimelineKind = 'GOVERNANCE' | 'REVALIDATION';

export interface KnowledgeTimelineEvent {
  id: string;
  assetId: string;
  assetName: string;
  kind: KnowledgeTimelineKind;
  action: string;
  timestamp: number;
  actor: 'USER' | 'SYSTEM';
  detail: string;
}

function freshness(freshUntil?: number): 'CURRENT' | 'STALE' | 'UNKNOWN' {
  if (!freshUntil) return 'UNKNOWN';
  return freshUntil >= Date.now() ? 'CURRENT' : 'STALE';
}

function activeDocument(project: MioProject, asset: ProjectAsset): boolean {
  if (asset.type !== 'document') return false;
  const record = project.knowledgeGovernance.sources[asset.id];
  return record?.included !== false && !record?.supersededByAssetId;
}

function severityFor(reasons: KnowledgeReviewReason[]): KnowledgeReviewSeverity {
  if (reasons.includes('SUSPICIOUS_CONTENT') || reasons.includes('OPEN_CONFLICT')) return 'CRITICAL';
  if (reasons.includes('STALE') || reasons.includes('REVALIDATION_DUE')) return 'HIGH';
  if (reasons.includes('QUARANTINED') || reasons.includes('UNKNOWN_FRESHNESS')) return 'MEDIUM';
  return 'LOW';
}

function revalidationDue(asset: ProjectAsset): boolean {
  const status = String(asset.data?.revalidationAdvisory?.status ?? '');
  return status === 'REVALIDATE_NOW' || status === 'REVALIDATE_BEFORE_CRITICAL_USE';
}

function suspicious(asset: ProjectAsset): boolean {
  return asset.data?.security?.suspicious === true || (Array.isArray(asset.data?.security?.detectedThreats) && asset.data.security.detectedThreats.length > 0);
}

function conflictAssetIds(project: MioProject): Set<string> {
  const health = KnowledgeHealth.evaluate(project);
  const ids = new Set<string>();
  for (const conflict of health.potentialConflicts.filter((item) => !item.resolution)) {
    ids.add(conflict.leftAssetId);
    ids.add(conflict.rightAssetId);
  }
  return ids;
}

function reasonSummary(reasons: KnowledgeReviewReason[]): string {
  if (reasons.length === 0) return 'No derived review debt.';
  return reasons.map((reason) => reason.replaceAll('_', ' ').toLowerCase()).join(' · ');
}

export class KnowledgeReviewInbox {
  public static build(project: MioProject): KnowledgeReviewInboxItem[] {
    const conflictIds = conflictAssetIds(project);
    return project.assets
      .filter((asset) => activeDocument(project, asset))
      .map((asset) => {
        const record = project.knowledgeGovernance.sources[asset.id];
        const trust = record?.trust ?? (asset.verified ? 'VERIFIED' : 'QUARANTINED');
        const sourceFreshness = freshness(record?.freshUntil);
        const reasons: KnowledgeReviewReason[] = [];
        if (trust !== 'VERIFIED') reasons.push('QUARANTINED');
        if (sourceFreshness === 'STALE') reasons.push('STALE');
        else if (sourceFreshness === 'UNKNOWN') reasons.push('UNKNOWN_FRESHNESS');
        if (revalidationDue(asset)) reasons.push('REVALIDATION_DUE');
        if (suspicious(asset)) reasons.push('SUSPICIOUS_CONTENT');
        if (conflictIds.has(asset.id)) reasons.push('OPEN_CONFLICT');
        return {
          assetId: asset.id,
          assetName: asset.name,
          severity: severityFor(reasons),
          reasons,
          trust,
          freshness: sourceFreshness,
          sourceUri: asset.filePath || `project-asset://${asset.id}`,
          summary: reasonSummary(reasons),
        };
      })
      .filter((item) => item.reasons.length > 0)
      .sort((a, b) => ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[a.severity] - ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[b.severity])) || a.assetName.localeCompare(b.assetName));
  }

  public static timeline(project: MioProject, assetId?: string): KnowledgeTimelineEvent[] {
    const governance = (project.knowledgeGovernance.history ?? [])
      .filter((event) => !assetId || event.assetId === assetId)
      .map((event): KnowledgeTimelineEvent => {
        const asset = project.assets.find((item) => item.id === event.assetId);
        const detail = [
          event.note,
          event.trust ? `trust ${event.trust}` : undefined,
          event.priority ? `priority ${event.priority}` : undefined,
          event.replacementAssetId ? `replacement ${event.replacementAssetId}` : undefined,
          event.upstreamSourceKey ? `upstream ${event.upstreamSourceKey}` : undefined,
        ].filter(Boolean).join(' · ') || `${event.actor} governance action`;
        return { id: event.id, assetId: event.assetId, assetName: asset?.name ?? event.assetId, kind: 'GOVERNANCE', action: event.action, timestamp: event.timestamp, actor: event.actor, detail };
      });

    const revalidation = project.assets
      .filter((asset) => (!assetId || asset.id === assetId) && Array.isArray(asset.data?.revalidationHistory))
      .flatMap((asset) => (asset.data.revalidationHistory as Array<Record<string, unknown>>).map((entry, index): KnowledgeTimelineEvent => ({
        id: `revalidation_${asset.id}_${String(entry.at ?? index)}_${index}`,
        assetId: asset.id,
        assetName: asset.name,
        kind: 'REVALIDATION',
        action: String(entry.decision ?? 'REVALIDATION_REVIEW'),
        timestamp: typeof entry.at === 'number' ? entry.at : asset.updatedAt,
        actor: 'USER',
        detail: [
          entry.contentChanged === true ? 'content changed' : entry.contentChanged === false ? 'content unchanged' : undefined,
          typeof entry.similarity === 'number' ? `similarity ${Math.round(entry.similarity * 100)}%` : undefined,
          Array.isArray(entry.metadataChanges) && entry.metadataChanges.length ? `metadata ${entry.metadataChanges.join(', ')}` : undefined,
          entry.suspicious === true ? 'suspicious candidate' : undefined,
          typeof entry.sourceUrl === 'string' ? entry.sourceUrl : undefined,
        ].filter(Boolean).join(' · ') || 'Controlled revalidation decision',
      })));

    return [...governance, ...revalidation].sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id)).slice(0, 250);
  }
}
