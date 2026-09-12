import { eventBus } from '../core/EventBus';
import { MioMemoryManager, MemoryWriteResult } from '../security/MemoryManager';
import { StorageProvider } from '../storage/StorageProvider';
import { defaultStorageProvider } from '../storage/StorageRuntime';

export type ContextMemoryLayer = 'WORKING' | 'CONVERSATION' | 'PROJECT';
export type ContextMemoryTrust = 'USER_AUTHORED' | 'SYSTEM_DERIVED' | 'PROJECT_VERIFIED' | 'EXTERNAL_UNTRUSTED';

export interface ContextMemoryItem {
  id: string;
  layer: ContextMemoryLayer;
  content: string;
  source: string;
  trust: ContextMemoryTrust;
  createdAt: number;
  updatedAt: number;
  projectId?: string;
  sessionId?: string;
  taskId?: string;
  expiresAt?: number;
  approvedByUser?: boolean;
}

interface PersistedProjectMemoryState {
  projectId: string;
  items: ContextMemoryItem[];
}

export interface ProjectMemoryInput {
  projectId: string;
  content: string;
  source: string;
  trust: ContextMemoryTrust;
  approvedByUser: boolean;
}

const projectStorageKey = (projectId: string) => `project-context:${projectId}`;

export class MemoryContextManager {
  private static storage: StorageProvider = defaultStorageProvider;
  private static working = new Map<string, ContextMemoryItem[]>();
  private static conversations = new Map<string, ContextMemoryItem[]>();
  private static projectMemory = new Map<string, ContextMemoryItem[]>();

  public static setStorageProvider(provider: StorageProvider): void {
    this.storage = provider;
  }

  public static async initializeProject(projectId: string): Promise<void> {
    const stored = await this.storage.get<PersistedProjectMemoryState>('memory', projectStorageKey(projectId));
    const items = stored?.projectId === projectId && Array.isArray(stored.items)
      ? stored.items.filter((item) => item.layer === 'PROJECT' && item.projectId === projectId)
      : [];
    this.projectMemory.set(projectId, items);
    eventBus.emit('PROJECT_MEMORY_UPDATED', { projectId, count: items.length });
  }

  public static addWorking(taskId: string, content: string, source = 'runtime', ttlMs = 30 * 60 * 1000): ContextMemoryItem | null {
    const normalized = content.trim();
    if (!taskId || !normalized) return null;
    const now = Date.now();
    const item: ContextMemoryItem = {
      id: `working_${now}_${Math.random().toString(36).slice(2, 7)}`,
      layer: 'WORKING',
      content: normalized,
      source,
      trust: 'SYSTEM_DERIVED',
      taskId,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + Math.max(1000, Math.min(ttlMs, 24 * 60 * 60 * 1000)),
    };
    const existing = this.working.get(taskId) ?? [];
    this.working.set(taskId, [...existing, item]);
    return { ...item };
  }

  public static getWorking(taskId: string): ContextMemoryItem[] {
    this.purgeExpired();
    return (this.working.get(taskId) ?? []).map((item) => ({ ...item }));
  }

  public static clearWorking(taskId: string): void {
    this.working.delete(taskId);
  }

  public static addConversation(sessionId: string, projectId: string, content: string, source: string): ContextMemoryItem | null {
    const normalized = content.trim();
    if (!sessionId || !projectId || !normalized) return null;
    const now = Date.now();
    const item: ContextMemoryItem = {
      id: `conversation_${now}_${Math.random().toString(36).slice(2, 7)}`,
      layer: 'CONVERSATION',
      content: normalized,
      source,
      trust: 'USER_AUTHORED',
      sessionId,
      projectId,
      createdAt: now,
      updatedAt: now,
    };
    const existing = this.conversations.get(sessionId) ?? [];
    this.conversations.set(sessionId, [...existing, item].slice(-50));
    return { ...item };
  }

  public static getConversation(sessionId: string): ContextMemoryItem[] {
    return (this.conversations.get(sessionId) ?? []).map((item) => ({ ...item }));
  }

  public static clearConversation(sessionId: string): void {
    this.conversations.delete(sessionId);
  }

  public static async addProjectMemory(input: ProjectMemoryInput): Promise<ContextMemoryItem | null> {
    const normalized = input.content.trim();
    if (!input.projectId || !normalized) return null;

    // External/untrusted content may live in project assets/knowledge quarantine, but not in project memory authority.
    if (input.trust === 'EXTERNAL_UNTRUSTED' || !input.approvedByUser) {
      eventBus.emit('MEMORY_POLICY_EVENT', {
        decision: 'PROJECT_MEMORY_DENIED',
        reason: input.trust === 'EXTERNAL_UNTRUSTED'
          ? 'External/untrusted content cannot be promoted directly to project memory.'
          : 'Project memory requires explicit user approval.',
        projectId: input.projectId,
      });
      return null;
    }

    const now = Date.now();
    const item: ContextMemoryItem = {
      id: `project_memory_${now}_${Math.random().toString(36).slice(2, 7)}`,
      layer: 'PROJECT',
      content: normalized,
      source: input.source,
      trust: input.trust,
      projectId: input.projectId,
      approvedByUser: true,
      createdAt: now,
      updatedAt: now,
    };
    const existing = this.projectMemory.get(input.projectId) ?? [];
    this.projectMemory.set(input.projectId, [...existing, item]);
    await this.flushProject(input.projectId);
    eventBus.emit('PROJECT_MEMORY_UPDATED', { projectId: input.projectId, count: existing.length + 1 });
    return { ...item };
  }

  public static getProjectMemory(projectId: string): ContextMemoryItem[] {
    return (this.projectMemory.get(projectId) ?? []).map((item) => ({ ...item }));
  }

  public static async deleteProjectMemory(projectId: string, itemId: string): Promise<boolean> {
    const existing = this.projectMemory.get(projectId) ?? [];
    const next = existing.filter((item) => item.id !== itemId);
    if (next.length === existing.length) return false;
    this.projectMemory.set(projectId, next);
    await this.flushProject(projectId);
    eventBus.emit('PROJECT_MEMORY_UPDATED', { projectId, count: next.length });
    return true;
  }

  public static proposeProjectMemoryForLongTerm(projectId: string, itemId: string): MemoryWriteResult | null {
    const item = (this.projectMemory.get(projectId) ?? []).find((entry) => entry.id === itemId);
    if (!item || !item.approvedByUser) return null;
    return MioMemoryManager.proposeMemory({
      category: 'PROJECT_CONTEXT',
      content: item.content,
      confidence: item.trust === 'PROJECT_VERIFIED' ? 0.95 : 0.85,
      source: `project-approved:${projectId}:${item.source}`,
      permissionLevel: 'L1_SUGGEST',
    });
  }

  public static purgeExpired(now = Date.now()): void {
    for (const [taskId, items] of this.working.entries()) {
      const active = items.filter((item) => !item.expiresAt || item.expiresAt > now);
      if (active.length) this.working.set(taskId, active);
      else this.working.delete(taskId);
    }
  }

  public static resetRuntimeLayers(): void {
    this.working.clear();
    this.conversations.clear();
  }

  private static async flushProject(projectId: string): Promise<void> {
    const state: PersistedProjectMemoryState = {
      projectId,
      items: this.projectMemory.get(projectId) ?? [],
    };
    await this.storage.set('memory', projectStorageKey(projectId), state);
  }
}
