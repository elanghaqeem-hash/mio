import { ProjectManager } from './ProjectManager';
import type { KnowledgeConflictResolutionStatus } from '../types/project';

function activeDocumentIds(): Set<string> {
  const project = ProjectManager.getProject();
  return new Set(project.assets.filter((asset) => asset.type === 'document' && project.knowledgeGovernance.sources[asset.id]?.included !== false && !project.knowledgeGovernance.sources[asset.id]?.supersededByAssetId).map((asset) => asset.id));
}

export class KnowledgeGovernanceWorkflow {
  public static createCorroborationGroup(label: string, assetIds: string[]): string | null {
    const project = ProjectManager.getProject();
    const active = activeDocumentIds();
    const uniqueIds = [...new Set(assetIds)].filter((id) => active.has(id));
    if (label.trim().length < 2 || uniqueIds.length < 2) return null;
    const now = Date.now();
    const group = { id: `kg_group_${now}_${Math.random().toString(36).slice(2, 7)}`, label: label.trim(), assetIds: uniqueIds, createdAt: now, updatedAt: now };
    project.knowledgeGovernance.corroborationGroups = [...(project.knowledgeGovernance.corroborationGroups ?? []), group].slice(-100);
    project.knowledgeGovernance.history.unshift({ id: `kg_${now}_${Math.random().toString(36).slice(2, 7)}`, assetId: uniqueIds[0], action: 'CORROBORATION_GROUP_CREATED', timestamp: now, actor: 'USER', note: `${group.label}: ${uniqueIds.length} sources` });
    project.knowledgeGovernance.history = project.knowledgeGovernance.history.slice(0, 500);
    project.knowledgeGovernance.updatedAt = now;
    ProjectManager.commitProjectUpdate(`Created knowledge corroboration group: ${group.label}`);
    return group.id;
  }

  public static reviewConflict(conflictKey: string, assetIds: string[], status: KnowledgeConflictResolutionStatus, note?: string, preferredAssetId?: string): boolean {
    const project = ProjectManager.getProject();
    const active = activeDocumentIds();
    const pair = [...new Set(assetIds)].filter((id) => active.has(id));
    if (!conflictKey || pair.length !== 2) return false;
    if (status === 'PREFER_SOURCE' && (!preferredAssetId || !pair.includes(preferredAssetId))) return false;
    const now = Date.now();
    project.knowledgeGovernance.conflictResolutions = project.knowledgeGovernance.conflictResolutions ?? {};
    project.knowledgeGovernance.conflictResolutions[conflictKey] = { conflictKey, status, note: note?.trim() || undefined, preferredAssetId: status === 'PREFER_SOURCE' ? preferredAssetId : undefined, reviewedAt: now };
    project.knowledgeGovernance.history.unshift({ id: `kg_${now}_${Math.random().toString(36).slice(2, 7)}`, assetId: pair[0], action: 'CONFLICT_REVIEWED', timestamp: now, actor: 'USER', conflictKey, note: `${status}${note?.trim() ? ` · ${note.trim()}` : ''}` });
    project.knowledgeGovernance.history = project.knowledgeGovernance.history.slice(0, 500);
    project.knowledgeGovernance.updatedAt = now;
    ProjectManager.commitProjectUpdate(`Reviewed knowledge conflict: ${status}`);
    return true;
  }
}
