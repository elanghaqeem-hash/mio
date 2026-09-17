import { eventBus } from '../core/EventBus';
import type { CreativeStudioMode } from './CreativeWorkspaceIntegration';

export type CreativeStudioOperationStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface CreativeStudioOperation {
  id: string;
  mode: CreativeStudioMode;
  instruction: string;
  taskId?: string;
  assetId?: string;
  status: CreativeStudioOperationStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface CreativeStudioExecutor {
  mode: CreativeStudioMode;
  execute(operation: CreativeStudioOperation): Promise<{ assetId?: string } | void>;
  cancel?(operationId: string): Promise<void> | void;
}

class CreativeParallelOrchestrator {
  private executors = new Map<CreativeStudioMode, CreativeStudioExecutor>();
  private operations = new Map<string, CreativeStudioOperation>();
  private activeByStudio = new Map<CreativeStudioMode, string>();
  private queues = new Map<CreativeStudioMode, string[]>();

  public register(executor: CreativeStudioExecutor): () => void {
    this.executors.set(executor.mode, executor);
    void this.drain(executor.mode);
    return () => { if (this.executors.get(executor.mode) === executor) this.executors.delete(executor.mode); };
  }

  public dispatch(requests: Array<{ mode: CreativeStudioMode; instruction: string; taskId?: string; assetId?: string }>): CreativeStudioOperation[] {
    const created = requests.map((request) => {
      const now = Date.now();
      const operation: CreativeStudioOperation = { ...request, id: `creative_op_${now}_${Math.random().toString(36).slice(2, 8)}`, status: 'QUEUED', createdAt: now };
      this.operations.set(operation.id, operation);
      const queue = this.queues.get(operation.mode) ?? [];
      queue.push(operation.id);
      this.queues.set(operation.mode, queue);
      eventBus.emit('CREATIVE_PARALLEL_OPERATION', { ...operation });
      return { ...operation };
    });
    for (const mode of new Set(created.map((operation) => operation.mode))) void this.drain(mode);
    return created;
  }

  public snapshot(): CreativeStudioOperation[] { return [...this.operations.values()].map((operation) => ({ ...operation })); }

  public async cancel(operationId: string): Promise<boolean> {
    const operation = this.operations.get(operationId);
    if (!operation || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(operation.status)) return false;
    const queue = this.queues.get(operation.mode) ?? [];
    this.queues.set(operation.mode, queue.filter((id) => id !== operationId));
    if (operation.status === 'RUNNING') await this.executors.get(operation.mode)?.cancel?.(operationId);
    operation.status = 'CANCELLED'; operation.completedAt = Date.now();
    if (this.activeByStudio.get(operation.mode) === operationId) this.activeByStudio.delete(operation.mode);
    eventBus.emit('CREATIVE_PARALLEL_OPERATION', { ...operation });
    void this.drain(operation.mode);
    return true;
  }

  private async drain(mode: CreativeStudioMode): Promise<void> {
    if (this.activeByStudio.has(mode)) return;
    const executor = this.executors.get(mode);
    if (!executor) return;
    const queue = this.queues.get(mode) ?? [];
    const operationId = queue.shift();
    this.queues.set(mode, queue);
    if (!operationId) return;
    const operation = this.operations.get(operationId);
    if (!operation || operation.status !== 'QUEUED') { void this.drain(mode); return; }
    this.activeByStudio.set(mode, operationId);
    operation.status = 'RUNNING'; operation.startedAt = Date.now();
    eventBus.emit('CREATIVE_PARALLEL_OPERATION', { ...operation });
    try {
      const result = await executor.execute({ ...operation });
      operation.status = 'COMPLETED'; operation.completedAt = Date.now();
      if (result?.assetId) operation.assetId = result.assetId;
    } catch (reason) {
      operation.status = 'FAILED'; operation.completedAt = Date.now(); operation.error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      this.activeByStudio.delete(mode);
      eventBus.emit('CREATIVE_PARALLEL_OPERATION', { ...operation });
      void this.drain(mode);
    }
  }
}

export const creativeParallelOrchestrator = new CreativeParallelOrchestrator();