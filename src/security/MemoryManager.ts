import { MemoryItem, PermissionLevel } from '../types/security';
import { eventBus } from '../core/EventBus';

export class MioMemoryManager {
  private static memories: MemoryItem[] = [
    {
      id: 'mem_1',
      timestamp: Date.now() - 3600000,
      category: 'PROJECT_CONTEXT',
      content: 'Project Mio V2 target: Unified Creative and Security Operating Environment',
      confidence: 1.0,
      source: 'USER_DIRECTIVE',
      permissionLevel: 'L0_OBSERVE',
    },
    {
      id: 'mem_2',
      timestamp: Date.now() - 1800000,
      category: 'USER_PREF',
      content: 'Color Palette preference: Electric Cyan (#00f0ff) and Obsidian Dark (#07090e)',
      confidence: 0.95,
      source: 'USER_DIRECTIVE',
      permissionLevel: 'L0_OBSERVE',
    },
  ];

  private static enabled: boolean = true;

  public static isEnabled(): boolean {
    return this.enabled;
  }

  public static setEnabled(enabled: boolean) {
    this.enabled = enabled;
    eventBus.emit('MEMORY_UPDATED', this.getMemories());
  }

  public static getMemories(): MemoryItem[] {
    return [...this.memories];
  }

  public static addMemory(item: Omit<MemoryItem, 'id' | 'timestamp'>): MemoryItem | null {
    if (!this.enabled) return null;

    // Safety: External content is prohibited from writing directly to long-term memory without L3/L4 permission
    if (item.source.toLowerCase().includes('web') || item.source.toLowerCase().includes('untrusted')) {
      console.warn('[MemoryManager] Denied external untrusted source from modifying long-term memory');
      return null;
    }

    const newMem: MemoryItem = {
      ...item,
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    };

    this.memories.push(newMem);
    eventBus.emit('MEMORY_UPDATED', this.getMemories());
    return newMem;
  }

  public static updateMemory(id: string, content: string, confidence: number = 1.0) {
    const mem = this.memories.find((m) => m.id === id);
    if (mem) {
      mem.content = content;
      mem.confidence = confidence;
      eventBus.emit('MEMORY_UPDATED', this.getMemories());
    }
  }

  public static deleteMemory(id: string) {
    this.memories = this.memories.filter((m) => m.id !== id);
    eventBus.emit('MEMORY_UPDATED', this.getMemories());
  }

  public static clearAll() {
    this.memories = [];
    eventBus.emit('MEMORY_UPDATED', this.getMemories());
  }
}
