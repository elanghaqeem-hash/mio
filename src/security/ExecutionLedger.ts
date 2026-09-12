import { eventBus } from '../core/EventBus';
import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import type { ExecutionLedgerEntry, ExecutionLedgerSnapshot, ResourceUsageEvent } from '../types/resources';
import type { TaskRuntimeEvent } from '../types/tasks';

const LEDGER_STORAGE_KEY = 'execution-ledger-v1';
const MAX_LEDGER_ENTRIES = 500;

export class ExecutionLedgerController {
  private entries: ExecutionLedgerEntry[] = [];
  private storage: StorageProvider = defaultStorageProvider;
  private initialized = false;

  constructor() {
    eventBus.on<TaskRuntimeEvent>('TASK_RUNTIME_EVENT', (event) => {
      const terminalOutcome = event.type === 'COMPLETED' ? 'COMPLETED' : event.type === 'FAILED' ? 'FAILED' : event.type === 'CANCELLED' ? 'CANCELLED' : 'INFO';
      this.record({
        taskId: event.taskId,
        category: 'TASK',
        action: event.type,
        outcome: terminalOutcome,
        details: event.details,
      });
    });

    eventBus.on<ResourceUsageEvent>('RESOURCE_USAGE_EVENT', (event) => {
      this.record({
        taskId: event.taskId,
        category: 'RESOURCE',
        action: event.operation,
        outcome: event.decision === 'ALLOW' ? 'ALLOWED' : 'BLOCKED',
        details: event.reason,
      });
    });
  }

  public async initialize(): Promise<ExecutionLedgerSnapshot> {
    if (this.initialized) return this.snapshot();
    try {
      const persisted = await this.storage.get<ExecutionLedgerSnapshot>('runtime', LEDGER_STORAGE_KEY);
      if (persisted?.entries?.length) this.entries = persisted.entries.slice(0, MAX_LEDGER_ENTRIES);
    } catch (error) {
      eventBus.emit('STORAGE_ERROR', {
        scope: 'EXECUTION_LEDGER',
        action: 'INITIALIZE',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    this.initialized = true;
    this.publish();
    return this.snapshot();
  }

  public setStorageProvider(provider: StorageProvider): void {
    this.storage = provider;
    this.initialized = false;
  }

  public record(input: Omit<ExecutionLedgerEntry, 'id' | 'timestamp'>): ExecutionLedgerEntry {
    const entry: ExecutionLedgerEntry = {
      ...input,
      id: `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    this.entries.unshift(entry);
    if (this.entries.length > MAX_LEDGER_ENTRIES) this.entries.length = MAX_LEDGER_ENTRIES;
    this.publish();
    return { ...entry };
  }

  public getForTask(taskId: string, limit: number = 50): ExecutionLedgerEntry[] {
    return this.entries.filter((entry) => entry.taskId === taskId).slice(0, Math.max(1, limit)).map((entry) => ({ ...entry }));
  }

  public snapshot(): ExecutionLedgerSnapshot {
    return { entries: this.entries.map((entry) => ({ ...entry })), updatedAt: Date.now() };
  }

  public async flush(): Promise<void> {
    try {
      await this.storage.set('runtime', LEDGER_STORAGE_KEY, this.snapshot());
    } catch (error) {
      eventBus.emit('STORAGE_ERROR', {
        scope: 'EXECUTION_LEDGER',
        action: 'WRITE',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public clear(): void {
    this.entries = [];
    this.publish();
  }

  private publish(): void {
    const snapshot = this.snapshot();
    eventBus.emit<ExecutionLedgerSnapshot>('EXECUTION_LEDGER_UPDATED', snapshot);
    if (this.initialized) void this.flush();
  }
}

export const executionLedger = new ExecutionLedgerController();
