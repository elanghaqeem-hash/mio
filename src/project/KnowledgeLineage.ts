import { ProjectManager } from './ProjectManager';
import type { MioProject } from '../types/project';

export interface KnowledgeLineageUpdate {
  upstreamSourceKey?: string;
  derivedFromAssetIds?: string[];
  note?: string;
}

export interface KnowledgeLineageFamily {
  assetId: string;
  familyKeys: string[];
  upstreamSourceKey?: string;
  derivedFromAssetIds: string[];
}

function documentIds(project: MioProject): Set<string> {
  return new Set(project.assets.filter((asset) => asset.type === 'document').map((asset) => asset.id));
}

function normalizedUpstreamKey(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, '-');
  return normalized && normalized.length >= 2 ? normalized.slice(0, 160) : undefined;
}

function dependencyMap(project: MioProject, overrideAssetId?: string, overrideDependencies?: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const asset of project.assets.filter((item) => item.type === 'document')) {
    const dependencies = asset.id === overrideAssetId
      ? overrideDependencies ?? []
      : project.knowledgeGovernance.sources[asset.id]?.lineage?.derivedFromAssetIds ?? [];
    map.set(asset.id, [...new Set(dependencies)]);
  }
  return map;
}

function hasCycle(map: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of map.get(id) ?? []) if (visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of map.keys()) if (visit(id)) return true;
  return false;
}

function collectFamilyKeys(project: MioProject, assetId: string, visited = new Set<string>()): Set<string> {
  if (visited.has(assetId)) return new Set();
  visited.add(assetId);
  const record = project.knowledgeGovernance.sources[assetId];
  const keys = new Set<string>();
  const upstream = normalizedUpstreamKey(record?.lineage?.upstreamSourceKey);
  if (upstream) keys.add(`upstream:${upstream}`);
  const dependencies = record?.lineage?.derivedFromAssetIds ?? [];
  for (const dependency of dependencies) {
    const nested = collectFamilyKeys(project, dependency, visited);
    for (const key of nested) keys.add(key);
  }
  if (keys.size === 0) keys.add(`asset:${assetId}`);
  return keys;
}

export class KnowledgeLineage {
  public static update(assetId: string, update: KnowledgeLineageUpdate): boolean {
    const project = ProjectManager.getProject();
    const documents = documentIds(project);
    if (!documents.has(assetId)) return false;
    const derivedFromAssetIds = [...new Set(update.derivedFromAssetIds ?? [])];
    if (derivedFromAssetIds.includes(assetId) || derivedFromAssetIds.some((id) => !documents.has(id))) return false;
    if (hasCycle(dependencyMap(project, assetId, derivedFromAssetIds))) return false;

    const record = project.knowledgeGovernance.sources[assetId];
    if (!record) return false;
    const now = Date.now();
    const upstreamSourceKey = normalizedUpstreamKey(update.upstreamSourceKey);
    record.lineage = {
      upstreamSourceKey,
      derivedFromAssetIds,
      note: update.note?.trim() || undefined,
      reviewedAt: now,
    };
    record.updatedAt = now;
    project.knowledgeGovernance.history.unshift({
      id: `kg_${now}_${Math.random().toString(36).slice(2, 7)}`,
      assetId,
      action: 'LINEAGE_UPDATED',
      timestamp: now,
      actor: 'USER',
      upstreamSourceKey,
      derivedFromAssetIds,
      note: record.lineage.note,
    });
    project.knowledgeGovernance.history = project.knowledgeGovernance.history.slice(0, 500);
    project.knowledgeGovernance.updatedAt = now;
    ProjectManager.commitProjectUpdate(`Updated knowledge lineage: ${project.assets.find((asset) => asset.id === assetId)?.name ?? assetId}`);
    return true;
  }

  public static inspect(project: MioProject, assetId: string): KnowledgeLineageFamily {
    const record = project.knowledgeGovernance.sources[assetId];
    return {
      assetId,
      familyKeys: [...collectFamilyKeys(project, assetId)].sort(),
      upstreamSourceKey: normalizedUpstreamKey(record?.lineage?.upstreamSourceKey),
      derivedFromAssetIds: [...(record?.lineage?.derivedFromAssetIds ?? [])],
    };
  }

  public static shareFamily(project: MioProject, leftAssetId: string, rightAssetId: string): boolean {
    const left = new Set(this.inspect(project, leftAssetId).familyKeys);
    return this.inspect(project, rightAssetId).familyKeys.some((key) => left.has(key));
  }

  public static independentFamilyCount(project: MioProject, assetIds: string[]): number {
    const families: string[][] = [];
    for (const assetId of [...new Set(assetIds)]) {
      const keys = this.inspect(project, assetId).familyKeys;
      if (!families.some((family) => family.some((key) => keys.includes(key)))) families.push(keys);
    }
    return families.length;
  }
}
