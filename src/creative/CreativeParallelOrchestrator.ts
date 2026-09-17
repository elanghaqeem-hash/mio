import { eventBus } from '../core/EventBus';
import type { CreativeStudioMode } from './CreativeWorkspaceIntegration';

export type CreativeStudioOperationStatus = 'QUEUED' | 'BLOCKED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'SKIPPED';
export interface CreativeStudioRequest { key?: string; mode: CreativeStudioMode; instruction: string; taskId?: string; assetId?: string; dependsOn?: string[]; }
export interface CreativeStudioOperation extends Omit<CreativeStudioRequest, 'dependsOn'> { id: string; dependsOn: string[]; status: CreativeStudioOperationStatus; createdAt: number; startedAt?: number; completedAt?: number; error?: string; }
export interface CreativeStudioExecutor { mode: CreativeStudioMode; execute(operation: CreativeStudioOperation): Promise<{ assetId?: string } | void>; cancel?(operationId: string): Promise<void> | void; }
export interface CreativeParallelSummary { total: number; queued: number; blocked: number; running: number; completed: number; failed: number; cancelled: number; skipped: number; progress: number; terminal: boolean; }

class CreativeParallelOrchestrator {
  private executors = new Map<CreativeStudioMode, CreativeStudioExecutor>();
  private operations = new Map<string, CreativeStudioOperation>();
  private activeByStudio = new Map<CreativeStudioMode, string>();
  private queues = new Map<CreativeStudioMode, string[]>();

  public register(executor: CreativeStudioExecutor): () => void { this.executors.set(executor.mode, executor); void this.drain(executor.mode); return () => { if (this.executors.get(executor.mode) === executor) this.executors.delete(executor.mode); }; }

  public dispatch(requests: CreativeStudioRequest[]): CreativeStudioOperation[] {
    const keyToId = new Map<string, string>(); const now = Date.now();
    for (const request of requests) if (request.key) keyToId.set(request.key, `creative_op_${now}_${Math.random().toString(36).slice(2, 8)}`);
    const created = requests.map((request) => {
      const id = request.key ? keyToId.get(request.key)! : `creative_op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const dependsOn = (request.dependsOn ?? []).map((dependency) => keyToId.get(dependency) ?? dependency);
      if (dependsOn.includes(id)) throw new Error(`Creative operation ${request.key ?? id} cannot depend on itself.`);
      const operation: CreativeStudioOperation = { ...request, id, dependsOn, status: dependsOn.length ? 'BLOCKED' : 'QUEUED', createdAt: Date.now() };
      this.operations.set(id, operation); const queue = this.queues.get(operation.mode) ?? []; queue.push(id); this.queues.set(operation.mode, queue); this.emit(operation); return { ...operation };
    });
    this.rejectDependencyCycles(created);
    this.pump(); return created;
  }

  public snapshot(): CreativeStudioOperation[] { return [...this.operations.values()].map((operation) => ({ ...operation, dependsOn: [...operation.dependsOn] })); }
  public summary(taskId?: string): CreativeParallelSummary { const operations = this.snapshot().filter((operation) => !taskId || operation.taskId === taskId); const count = (status: CreativeStudioOperationStatus) => operations.filter((operation) => operation.status === status).length; const terminalCount = operations.filter((operation) => ['COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED'].includes(operation.status)).length; return { total: operations.length, queued: count('QUEUED'), blocked: count('BLOCKED'), running: count('RUNNING'), completed: count('COMPLETED'), failed: count('FAILED'), cancelled: count('CANCELLED'), skipped: count('SKIPPED'), progress: operations.length ? Math.round((terminalCount / operations.length) * 100) : 100, terminal: operations.length > 0 && terminalCount === operations.length }; }

  public async cancel(operationId: string): Promise<boolean> { const operation = this.operations.get(operationId); if (!operation || this.isTerminal(operation)) return false; const queue = this.queues.get(operation.mode) ?? []; this.queues.set(operation.mode, queue.filter((id) => id !== operationId)); if (operation.status === 'RUNNING') await this.executors.get(operation.mode)?.cancel?.(operationId); operation.status = 'CANCELLED'; operation.completedAt = Date.now(); if (this.activeByStudio.get(operation.mode) === operationId) this.activeByStudio.delete(operation.mode); this.emit(operation); this.reconcileDependencies(); this.pump(); return true; }

  private pump(): void { this.reconcileDependencies(); for (const mode of this.queues.keys()) void this.drain(mode); }
  private reconcileDependencies(): void { for (const operation of this.operations.values()) { if (this.isTerminal(operation) || operation.status === 'RUNNING') continue; const dependencies = operation.dependsOn.map((id) => this.operations.get(id)); const failed = dependencies.find((dependency) => dependency && ['FAILED', 'CANCELLED', 'SKIPPED'].includes(dependency.status)); if (failed) { operation.status = 'SKIPPED'; operation.completedAt = Date.now(); operation.error = `Dependency ${failed.id} ended as ${failed.status}`; this.emit(operation); continue; } const ready = dependencies.every((dependency) => dependency?.status === 'COMPLETED'); const next = ready ? 'QUEUED' : 'BLOCKED'; if (operation.status !== next) { operation.status = next; this.emit(operation); } } }
  private async drain(mode: CreativeStudioMode): Promise<void> { if (this.activeByStudio.has(mode)) return; const executor = this.executors.get(mode); if (!executor) return; const queue = this.queues.get(mode) ?? []; const index = queue.findIndex((id) => this.operations.get(id)?.status === 'QUEUED'); if (index < 0) return; const [operationId] = queue.splice(index, 1); this.queues.set(mode, queue); const operation = this.operations.get(operationId); if (!operation || operation.status !== 'QUEUED') { this.pump(); return; } this.activeByStudio.set(mode, operationId); operation.status = 'RUNNING'; operation.startedAt = Date.now(); this.emit(operation); try { const result = await executor.execute({ ...operation, dependsOn: [...operation.dependsOn] }); operation.status = 'COMPLETED'; operation.completedAt = Date.now(); if (result?.assetId) operation.assetId = result.assetId; } catch (reason) { operation.status = 'FAILED'; operation.completedAt = Date.now(); operation.error = reason instanceof Error ? reason.message : String(reason); } finally { this.activeByStudio.delete(mode); this.emit(operation); this.pump(); } }
  private rejectDependencyCycles(created: CreativeStudioOperation[]): void { const createdIds = new Set(created.map((operation) => operation.id)); const visit = (id: string, visiting: Set<string>, visited: Set<string>) => { if (visiting.has(id)) throw new Error('Creative parallel plan contains a dependency cycle.'); if (visited.has(id)) return; visiting.add(id); const operation = this.operations.get(id); for (const dependency of operation?.dependsOn ?? []) if (createdIds.has(dependency)) visit(dependency, visiting, visited); visiting.delete(id); visited.add(id); }; const visited = new Set<string>(); for (const operation of created) visit(operation.id, new Set(), visited); }
  private isTerminal(operation: CreativeStudioOperation): boolean { return ['COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED'].includes(operation.status); }
  private emit(operation: CreativeStudioOperation): void { eventBus.emit('CREATIVE_PARALLEL_OPERATION', { ...operation, dependsOn: [...operation.dependsOn] }); eventBus.emit('CREATIVE_PARALLEL_SUMMARY', this.summary(operation.taskId)); }
}
export const creativeParallelOrchestrator = new CreativeParallelOrchestrator();