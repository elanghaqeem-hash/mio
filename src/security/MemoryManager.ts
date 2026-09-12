import { MemoryItem } from '../types/security';
import { eventBus } from '../core/EventBus';
import { StorageProvider } from '../storage/StorageProvider';
import { defaultStorageProvider } from '../storage/StorageRuntime';
import { MemoryPolicy } from '../memory/MemoryPolicy';

const MEMORY_STORAGE_KEY = 'long-term-memory';

export interface PendingMemoryCandidate {
  id: string;
  createdAt: number;
  item: Omit<MemoryItem, 'id' | 'timestamp'>;
  reason: string;
}

interface PersistedMemoryState {
  enabled: boolean;
  memories: MemoryItem[];
  pendingCandidates?: PendingMemoryCandidate[];
}

export type MemoryWriteResult =
  | { status: 'SAVED'; memory: MemoryItem }
  | { status: 'REVIEW_REQUIRED'; candidateId: string; reason: string }
  | { status: 'DENIED'; reason: string };

export class MioMemoryManager {
  private static storage: StorageProvider = defaultStorageProvider;
  private static memories: MemoryItem[] = [];
  private static pendingCandidates: PendingMemoryCandidate[] = [];
  private static enabled = true;
  private static initialized = false;

  public static async initialize(): Promise<void> {
    try {
      const stored = await this.storage.get<PersistedMemoryState>('memory', MEMORY_STORAGE_KEY);
      if (stored) {
        this.enabled = stored.enabled !== false;
        this.memories = Array.isArray(stored.memories) ? stored.memories : [];
        this.pendingCandidates = Array.isArray(stored.pendingCandidates) ? stored.pendingCandidates : [];
      }
      this.initialized = true;
      eventBus.emit('MEMORY_UPDATED', this.getMemories());
      eventBus.emit('MEMORY_REVIEW_QUEUE_UPDATED', this.getPendingCandidates());
    } catch (error) {
      console.error('[MemoryManager] Persistence initialization failed; continuing with runtime memory.', error);
      eventBus.emit('STORAGE_ERROR', {
        scope: 'MEMORY',
        action: 'INITIALIZE',
        error: error instanceof Error ? error.message : String(error),
      });
      this.initialized = true;
    }
  }

  public static setStorageProvider(provider: StorageProvider): void {
    this.storage = provider;
    this.initialized = false;
  }

  public static isInitialized(): boolean { return this.initialized; }
  public static isEnabled(): boolean { return this.enabled; }

  public static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    eventBus.emit('MEMORY_UPDATED', this.getMemories());
    void this.flush();
  }

  public static getMemories(): MemoryItem[] {
    return this.memories.map((memory) => ({ ...memory }));
  }

  public static getPendingCandidates(): PendingMemoryCandidate[] {
    return this.pendingCandidates.map((candidate) => ({ ...candidate, item: { ...candidate.item } }));
  }

  public static proposeMemory(item: Omit<MemoryItem, 'id' | 'timestamp'>): MemoryWriteResult {
    if (!this.enabled) return { status: 'DENIED', reason: 'Long-term memory is disabled.' };

    const decision = MemoryPolicy.evaluateWrite(item);
    if (decision.decision === 'DENY') {
      eventBus.emit('MEMORY_POLICY_EVENT', { decision: 'DENY', reason: decision.reason, source: item.source });
      return { status: 'DENIED', reason: decision.reason };
    }

    if (decision.decision === 'REVIEW') {
      const candidate: PendingMemoryCandidate = {
        id: `mem_candidate_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        createdAt: Date.now(),
        item: { ...item },
        reason: decision.reason,
      };
      this.pendingCandidates.push(candidate);
      eventBus.emit('MEMORY_REVIEW_REQUIRED', candidate);
      eventBus.emit('MEMORY_REVIEW_QUEUE_UPDATED', this.getPendingCandidates());
      void this.flush();
      return { status: 'REVIEW_REQUIRED', candidateId: candidate.id, reason: candidate.reason };
    }

    return { status: 'SAVED', memory: this.saveTrustedMemory(item) };
  }

  public static addMemory(item: Omit<MemoryItem, 'id' | 'timestamp'>): MemoryItem | null {
    const result = this.proposeMemory(item);
    return result.status === 'SAVED' ? result.memory : null;
  }

  public static approveCandidate(candidateId: string): MemoryItem | null {
    const index = this.pendingCandidates.findIndex((candidate) => candidate.id === candidateId);
    if (index < 0 || !this.enabled) return null;
    const [candidate] = this.pendingCandidates.splice(index, 1);
    const memory = this.saveTrustedMemory(candidate.item);
    eventBus.emit('MEMORY_POLICY_EVENT', { decision: 'APPROVED_BY_USER', candidateId, source: candidate.item.source });
    eventBus.emit('MEMORY_REVIEW_QUEUE_UPDATED', this.getPendingCandidates());
    void this.flush();
    return memory;
  }

  public static rejectCandidate(candidateId: string): boolean {
    const before = this.pendingCandidates.length;
    this.pendingCandidates = this.pendingCandidates.filter((candidate) => candidate.id !== candidateId);
    const removed = this.pendingCandidates.length < before;
    if (removed) {
      eventBus.emit('MEMORY_POLICY_EVENT', { decision: 'REJECTED_BY_USER', candidateId });
      eventBus.emit('MEMORY_REVIEW_QUEUE_UPDATED', this.getPendingCandidates());
      void this.flush();
    }
    return removed;
  }

  public static updateMemory(id: string, content: string, confidence = 1): boolean {
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1 || !content.trim()) return false;
    const memory = this.memories.find((item) => item.id === id);
    if (!memory) return false;
    memory.content = content;
    memory.confidence = confidence;
    eventBus.emit('MEMORY_UPDATED', this.getMemories());
    void this.flush();
    return true;
  }

  public static deleteMemory(id: string): boolean {
    const before = this.memories.length;
    this.memories = this.memories.filter((memory) => memory.id !== id);
    const removed = this.memories.length < before;
    if (removed) {
      eventBus.emit('MEMORY_UPDATED', this.getMemories());
      void this.flush();
    }
    return removed;
  }

  public static clearAll(): void {
    this.memories = [];
    this.pendingCandidates = [];
    eventBus.emit('MEMORY_UPDATED', this.getMemories());
    eventBus.emit('MEMORY_REVIEW_QUEUE_UPDATED', this.getPendingCandidates());
    void this.flush();
  }

  public static async flush(): Promise<void> {
    try {
      await this.storage.set<PersistedMemoryState>('memory', MEMORY_STORAGE_KEY, {
        enabled: this.enabled,
        memories: this.memories,
        pendingCandidates: this.pendingCandidates,
      });
    } catch (error) {
      console.error('[MemoryManager] Failed to persist long-term memory.', error);
      eventBus.emit('STORAGE_ERROR', {
        scope: 'MEMORY',
        action: 'WRITE',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private static saveTrustedMemory(item: Omit<MemoryItem, 'id' | 'timestamp'>): MemoryItem {
    const memory: MemoryItem = {
      ...item,
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };
    this.memories.push(memory);
    eventBus.emit('MEMORY_UPDATED', this.getMemories());
    void this.flush();
    return memory;
  }
}
