import { MemoryItem } from '../types/security';
import { eventBus } from '../core/EventBus';

export class MioMemoryManager {
  private static memories: MemoryItem[] = [];
  private static enabled = true;

  public static isEnabled(): boolean { return this.enabled; }
  public static setEnabled(enabled: boolean) { this.enabled = enabled; eventBus.emit('MEMORY_UPDATED', this.getMemories()); }
  public static getMemories(): MemoryItem[] { return this.memories.map((m) => ({ ...m })); }

  public static addMemory(item: Omit<MemoryItem, 'id' | 'timestamp'>): MemoryItem | null {
    if (!this.enabled) return null;
    const source = String(item.source || '').toLowerCase();
    if (source.includes('web') || source.includes('untrusted') || source.includes('external')) {
      eventBus.emit('SECURITY_EVENT', { id: crypto.randomUUID(), timestamp: Date.now(), level: 'blocked', category: 'MEMORY_INTEGRITY', action: 'UNTRUSTED_MEMORY_WRITE', details: 'Blocked untrusted source from writing long-term memory', blocked: true });
      return null;
    }
    const content = String(item.content || '').trim().slice(0, 10_000);
    if (!content) return null;
    const newMem: MemoryItem = { ...item, content, confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)), id: `mem_${crypto.randomUUID()}`, timestamp: Date.now() };
    this.memories.push(newMem); eventBus.emit('MEMORY_UPDATED', this.getMemories()); return { ...newMem };
  }

  public static updateMemory(id: string, content: string, confidence = 1.0) {
    const mem = this.memories.find((m) => m.id === id); if (!mem) return;
    mem.content = String(content).slice(0, 10_000); mem.confidence = Math.max(0, Math.min(1, confidence)); eventBus.emit('MEMORY_UPDATED', this.getMemories());
  }
  public static deleteMemory(id: string) { this.memories = this.memories.filter((m) => m.id !== id); eventBus.emit('MEMORY_UPDATED', this.getMemories()); }
  public static clearAll() { this.memories = []; eventBus.emit('MEMORY_UPDATED', this.getMemories()); }
}
