import { ContextMemoryItem, MemoryContextManager } from '../../memory/MemoryContextManager';
import { ProjectKnowledgeContext, ProjectKnowledgeIndex } from '../../project/ProjectKnowledgeIndex';
import { MemoryContextEnvelope, MemoryContextSource, MemoryContextTrust, ModelMessage } from '../../types/models';
import { MioProject } from '../../types/project';

export interface ModelContextAssemblyOptions {
  projectKnowledgeEnabled?: boolean;
  memoryEnabled?: boolean;
  excludedAssetIds?: string[];
  projectContextBudgetChars?: number;
  memoryContextBudgetChars?: number;
  sessionId?: string;
  recentConversation?: ModelMessage[];
}

export interface ModelContextAssembly {
  projectKnowledge: ProjectKnowledgeContext;
  memoryContext?: MemoryContextEnvelope;
  memorySources: MemoryContextSource[];
}

const DEFAULT_MEMORY_BUDGET = 3600;
const MAX_MEMORY_BUDGET = 6000;
const MAX_MEMORY_ITEM_CHARS = 1000;
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'yang', 'dan', 'untuk', 'dengan', 'dari', 'atau', 'ini', 'itu', 'pada', 'dalam']);

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function queryTerms(value: string): string[] {
  return [...new Set(value.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? [])].filter((term) => !STOP_WORDS.has(term));
}

function trustFor(item: ContextMemoryItem): MemoryContextTrust | undefined {
  if (item.trust === 'EXTERNAL_UNTRUSTED') return undefined;
  return item.trust;
}

function relevance(item: ContextMemoryItem, terms: string[], now: number): number {
  const haystack = item.content.toLowerCase();
  const overlap = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
  const ageHours = Math.max(0, now - item.updatedAt) / 3_600_000;
  const recency = Math.max(0, 1 - Math.min(ageHours, 72) / 72);
  const layerBase = item.layer === 'WORKING' ? 8 : item.layer === 'PROJECT' ? 3 : 2;
  return layerBase + overlap * 2 + recency;
}

function toSource(item: ContextMemoryItem): MemoryContextSource | undefined {
  const trust = trustFor(item);
  if (!trust) return undefined;
  const content = item.content.trim().slice(0, MAX_MEMORY_ITEM_CHARS);
  if (!content) return undefined;
  return {
    id: item.id,
    layer: item.layer,
    trust,
    source: item.source.slice(0, 240),
    content,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export class ModelContextAssembler {
  public static async assemble(
    project: MioProject,
    query: string,
    taskId: string,
    options: ModelContextAssemblyOptions = {},
  ): Promise<ModelContextAssembly> {
    const projectKnowledge = options.projectKnowledgeEnabled === false
      ? { query, hits: [], contextText: '', applicationContext: undefined }
      : ProjectKnowledgeIndex.retrieve(project, query, {
        excludedAssetIds: options.excludedAssetIds,
        contextBudgetChars: options.projectContextBudgetChars,
      });

    if (options.memoryEnabled === false) return { projectKnowledge, memorySources: [] };

    await MemoryContextManager.ensureProjectInitialized(project.id);
    MemoryContextManager.purgeExpired();

    const recentDirect = new Set((options.recentConversation ?? [])
      .filter((message) => message.role !== 'system')
      .map((message) => normalize(message.content))
      .filter(Boolean));

    const candidates: ContextMemoryItem[] = [
      ...MemoryContextManager.getWorking(taskId),
      ...(options.sessionId ? MemoryContextManager.getConversation(options.sessionId) : []),
      ...MemoryContextManager.getProjectMemory(project.id),
    ].filter((item) => {
      if (item.layer === 'WORKING') return item.taskId === taskId;
      if (item.layer === 'CONVERSATION') return Boolean(options.sessionId) && item.sessionId === options.sessionId && item.projectId === project.id;
      return item.layer === 'PROJECT' && item.projectId === project.id && item.approvedByUser === true;
    }).filter((item) => item.trust !== 'EXTERNAL_UNTRUSTED');

    const dedup = new Set<string>();
    const terms = queryTerms(query);
    const now = Date.now();
    const ranked = candidates
      .filter((item) => {
        const key = normalize(item.content);
        if (!key || recentDirect.has(key) || dedup.has(key)) return false;
        dedup.add(key);
        return true;
      })
      .sort((a, b) => relevance(b, terms, now) - relevance(a, terms, now) || b.updatedAt - a.updatedAt);

    const budget = Math.max(600, Math.min(options.memoryContextBudgetChars ?? DEFAULT_MEMORY_BUDGET, MAX_MEMORY_BUDGET));
    const memorySources: MemoryContextSource[] = [];
    let used = 0;
    for (const item of ranked) {
      const source = toSource(item);
      if (!source) continue;
      if (used + source.content.length > budget && memorySources.length > 0) continue;
      memorySources.push(source);
      used += source.content.length;
      if (used >= budget) break;
    }

    const memoryContext: MemoryContextEnvelope | undefined = memorySources.length > 0 ? {
      kind: 'MIO_MEMORY',
      policy: 'DATA_ONLY',
      projectId: project.id,
      sessionId: options.sessionId,
      taskId,
      contextBudgetChars: budget,
      sources: memorySources,
    } : undefined;

    return { projectKnowledge, memoryContext, memorySources };
  }
}
