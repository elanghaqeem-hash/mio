import { eventBus } from '../core/EventBus';
import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import type { ExecutionHistoryRecord, ExecutionHistorySnapshot } from '../types/execution';
import type { ResourceUsageEvent } from '../types/resources';
import type { SecurityEvent } from '../types/security';
import type { TaskRuntimeEvent } from '../types/tasks';

const STORAGE_KEY = 'execution-history-v1';
const MAX_RECORDS = 500;

export class ExecutionHistory {
  private storage: StorageProvider = defaultStorageProvider;
  private records: ExecutionHistoryRecord[] = [];
  private initialized = false;
  private subscriptionsInstalled = false;

  public async initialize(): Promise<ExecutionHistorySnapshot> {
    if (!this.initialized) {
      try {
        const stored = await this.storage.get<ExecutionHistorySnapshot>('runtime', STORAGE_KEY);
        this.records = Array.isArray(stored?.records) ? stored!.records.slice(-MAX_RECORDS) : [];
      } catch (error) {
        eventBus.emit('STORAGE_ERROR', { scope: 'EXECUTION_HISTORY', action: 'INITIALIZE', error: error instanceof Error ? error.message : String(error) });
      }
      this.initialized = true;
    }
    this.installSubscriptions();
    return this.snapshot();
  }

  public setStorageProvider(provider: StorageProvider): void {
    this.storage = provider;
    this.initialized = false;
  }

  public snapshot(): ExecutionHistorySnapshot {
    return { records: this.records.map((record) => ({ ...record, resourceState: record.resourceState ? { ...record.resourceState, budget: { ...record.resourceState.budget }, usage: { ...record.resourceState.usage } } : undefined })), updatedAt: Date.now() };
  }

  public getForTask(taskId: string): ExecutionHistoryRecord[] {
    return this.snapshot().records.filter((record) => record.taskId === taskId);
  }

  public clear(): void {
    this.records = [];
    this.publish();
  }

  public async flush(): Promise<void> {
    try {
      await this.storage.set('runtime', STORAGE_KEY, this.snapshot());
    } catch (error) {
      eventBus.emit('STORAGE_ERROR', { scope: 'EXECUTION_HISTORY', action: 'WRITE', error: error instanceof Error ? error.message : String(error) });
    }
  }

  private installSubscriptions(): void {
    if (this.subscriptionsInstalled) return;
    this.subscriptionsInstalled = true;
    eventBus.on<TaskRuntimeEvent>('TASK_RUNTIME_EVENT', (event) => this.append({
      id: this.id('task'), taskId: event.taskId, timestamp: event.timestamp, kind: 'TASK', event: event.type, details: event.details,
    }));
    eventBus.on<ResourceUsageEvent>('RESOURCE_USAGE', (event) => this.append({
      id: this.id('resource'), taskId: event.taskId, timestamp: event.timestamp, kind: 'RESOURCE', event: event.operation,
      details: event.state.exhausted ? event.state.exhaustedReason : undefined, resourceState: event.state,
    }));
    eventBus.on<SecurityEvent>('SECURITY_EVENT', (event) => this.append({
      id: this.id('security'), timestamp: event.timestamp, kind: 'SECURITY', event: event.action, details: event.details,
    }));
  }

  private append(record: ExecutionHistoryRecord): void {
    this.records.push(record);
    if (this.records.length > MAX_RECORDS) this.records.splice(0, this.records.length - MAX_RECORDS);
    this.publish();
  }

  private publish(): void {
    const snapshot = this.snapshot();
    eventBus.emit<ExecutionHistorySnapshot>('EXECUTION_HISTORY_UPDATED', snapshot);
    if (this.initialized) void this.flush();
  }

  private id(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
}

export const executionHistory = new ExecutionHistory();
