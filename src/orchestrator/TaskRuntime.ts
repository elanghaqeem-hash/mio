import { eventBus } from '../core/EventBus';
import { emergencyStop } from '../core/EmergencyStop';
import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import type { TaskPlan } from './TaskPlanner';
import type { RuntimeTask, RuntimeTaskStep, TaskRuntimeEvent, TaskRuntimeSnapshot, TaskRuntimeStatus, TaskStepResultBinding } from '../types/tasks';

const TERMINAL_STATES = new Set<TaskRuntimeStatus>(['COMPLETED', 'FAILED', 'CANCELLED']);
const RUNTIME_STORAGE_KEY = 'task-runtime-v1';

class TaskRuntimeController {
  private readonly tasks = new Map<string, RuntimeTask>();
  private readonly cancellationHandlers = new Map<string, Set<() => void>>();
  private storage: StorageProvider = defaultStorageProvider;
  private initialized = false;

  constructor() { emergencyStop.registerAbortHandler(() => this.cancelAllActive('STOP MIO / Emergency Stop')); }

  public async initialize(): Promise<TaskRuntimeSnapshot> {
    if (this.initialized) return this.snapshot();
    try {
      const persisted = await this.storage.get<TaskRuntimeSnapshot>('runtime', RUNTIME_STORAGE_KEY);
      if (persisted?.tasks?.length) for (const raw of persisted.tasks) this.tasks.set(raw.id, this.normalizeRecoveredTask(raw));
    } catch (error) {
      eventBus.emit('STORAGE_ERROR', { scope: 'TASK_RUNTIME', action: 'INITIALIZE', error: error instanceof Error ? error.message : String(error) });
    }
    this.initialized = true; this.publishSnapshot(); return this.snapshot();
  }

  public setStorageProvider(provider: StorageProvider): void { this.storage = provider; this.initialized = false; }
  public isInitialized(): boolean { return this.initialized; }

  public create(plan: TaskPlan, prompt: string, projectId?: string, maxRetries: number = 1): RuntimeTask {
    const now = Date.now();
    const task: RuntimeTask = {
      id: plan.id, title: this.deriveTitle(prompt, plan.primaryMode), prompt, mode: plan.primaryMode, projectId,
      status: plan.status === 'WAITING_PERMISSION' ? 'WAITING_PERMISSION' : 'PENDING', progress: 0,
      steps: plan.steps.map((step): RuntimeTaskStep => ({ ...step, status: 'PENDING' })),
      createdAt: now, updatedAt: now, retryCount: 0, maxRetries, dependencies: [],
    };
    this.tasks.set(task.id, task); this.emitTaskEvent(task.id, 'CREATED'); this.publishSnapshot(); return this.clone(task);
  }

  public registerCancellationHandler(taskId: string, handler: () => void): () => void {
    if (!this.cancellationHandlers.has(taskId)) this.cancellationHandlers.set(taskId, new Set());
    this.cancellationHandlers.get(taskId)!.add(handler);
    return () => { const handlers = this.cancellationHandlers.get(taskId); handlers?.delete(handler); if (handlers?.size === 0) this.cancellationHandlers.delete(taskId); };
  }

  public isCancelled(taskId: string): boolean { return this.tasks.get(taskId)?.status === 'CANCELLED'; }

  public start(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId); if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    task.status = 'RUNNING'; task.startedAt ??= Date.now(); task.updatedAt = Date.now(); this.emitTaskEvent(taskId, 'STARTED'); this.publishSnapshot(); return this.clone(task);
  }

  public waitForPermission(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId); if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    task.status = 'WAITING_PERMISSION'; task.updatedAt = Date.now(); this.emitTaskEvent(taskId, 'WAITING_PERMISSION'); this.publishSnapshot(); return this.clone(task);
  }

  public pause(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId); if (!task || task.status !== 'RUNNING') return task ? this.clone(task) : undefined;
    task.status = 'PAUSED'; task.updatedAt = Date.now(); this.emitTaskEvent(taskId, 'PAUSED'); this.publishSnapshot(); return this.clone(task);
  }

  public resume(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId); if (!task || task.status !== 'PAUSED' || emergencyStop.isEmergencyStopped()) return task ? this.clone(task) : undefined;
    task.status = 'RUNNING'; task.updatedAt = Date.now(); this.emitTaskEvent(taskId, 'RESUMED'); this.publishSnapshot(); return this.clone(task);
  }

  public startStep(taskId: string, stepId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId); if (!task || TERMINAL_STATES.has(task.status) || task.status === 'PAUSED') return task ? this.clone(task) : undefined;
    const stepIndex = task.steps.findIndex((item) => item.id === stepId);
    if (stepIndex < 0) { this.emitTaskEvent(taskId, 'STEP_BLOCKED', `Unknown planned step ${stepId}`); return this.clone(task); }
    const step = task.steps[stepIndex];
    if (step.status !== 'PENDING') { this.emitTaskEvent(taskId, 'STEP_BLOCKED', `Step ${stepId} is ${step.status}, expected PENDING`); return this.clone(task); }
    const priorIncomplete = task.steps.slice(0, stepIndex).find((item) => item.status !== 'COMPLETED' && item.status !== 'SKIPPED');
    if (priorIncomplete) { this.emitTaskEvent(taskId, 'STEP_BLOCKED', `Step ${stepId} blocked by prior step ${priorIncomplete.id}:${priorIncomplete.status}`); return this.clone(task); }
    const otherRunning = task.steps.find((item) => item.status === 'RUNNING');
    if (otherRunning) { this.emitTaskEvent(taskId, 'STEP_BLOCKED', `Step ${stepId} blocked while ${otherRunning.id} is RUNNING`); return this.clone(task); }
    task.status = step.requiresPermission && task.status === 'WAITING_PERMISSION' ? 'WAITING_PERMISSION' : 'RUNNING';
    step.status = 'RUNNING'; step.startedAt = Date.now(); task.updatedAt = Date.now(); this.recalculateProgress(task); this.emitTaskEvent(taskId, 'STEP_STARTED', step.label); this.publishSnapshot(); return this.clone(task);
  }

  public bindStepResult(taskId: string, stepId: string, binding: Omit<TaskStepResultBinding, 'recordedAt'> & { recordedAt?: number }): RuntimeTask | undefined {
    const task = this.getMutable(taskId); if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    const step = task.steps.find((item) => item.id === stepId);
    if (!step || step.status !== 'RUNNING') { this.emitTaskEvent(taskId, 'STEP_BLOCKED', `Result binding rejected for ${stepId}; step is not RUNNING`); return this.clone(task); }
    step.resultBinding = { ...binding, recordedAt: binding.recordedAt ?? Date.now() };
    task.updatedAt = Date.now(); this.emitTaskEvent(taskId, 'STEP_RESULT_BOUND', `${stepId} → ${step.resultBinding.kind}:${step.resultBinding.operationId}:${step.resultBinding.outcome}`); this.publishSnapshot(); return this.clone(task);
  }

  public completeStep(taskId: string, stepId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId); if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    const step = task.steps.find((item) => item.id === stepId); if (!step || step.status !== 'RUNNING') return this.clone(task);
    if (step.id === 'execute' && (!step.resultBinding || step.resultBinding.outcome !== 'SUCCESS')) {
      this.emitTaskEvent(taskId, 'STEP_BLOCKED', 'Execute step cannot complete without a SUCCESS result binding');
      return this.clone(task);
    }
    const preservePause = task.status === 'PAUSED';
    step.status = 'COMPLETED'; step.completedAt = Date.now(); task.status = preservePause ? 'PAUSED' : 'RUNNING'; task.updatedAt = Date.now();
    this.recalculateProgress(task); this.emitTaskEvent(taskId, 'STEP_COMPLETED', step.label); this.publishSnapshot(); return this.clone(task);
  }

  public complete(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId); if (!task || TERMINAL_STATES.has(task.status) || task.status === 'PAUSED') return task ? this.clone(task) : undefined;
    const incomplete = task.steps.find((step) => step.status !== 'COMPLETED' && step.status !== 'SKIPPED');
    if (incomplete) { this.emitTaskEvent(taskId, 'COMPLETION_BLOCKED', `Task completion blocked by ${incomplete.id}:${incomplete.status}`); this.publishSnapshot(); return this.clone(task); }
    task.status = 'COMPLETED'; task.progress = 100; task.completedAt = Date.now(); task.updatedAt = task.completedAt; this.cancellationHandlers.delete(taskId);
    this.emitTaskEvent(taskId, 'COMPLETED'); this.publishSnapshot(); return this.clone(task);
  }

  public fail(taskId: string, error: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId); if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    const failedAt = Date.now();
    const runningStep = task.steps.find((step) => step.status === 'RUNNING');
    if (runningStep) {
      runningStep.status = 'FAILED'; runningStep.error = error; runningStep.completedAt = failedAt;
      if (!runningStep.resultBinding) runningStep.resultBinding = { kind: runningStep.id === 'execute' ? 'CONTROL' : 'VALIDATION', operationId: `runtime:${runningStep.id}`, outcome: 'FAILED', validationStatus: 'FAILED', recordedAt: failedAt };
    }
    task.steps.forEach((step) => {
      if (step.status === 'PENDING') {
        step.status = 'SKIPPED';
        step.error = `Skipped because task failed${runningStep ? ` at ${runningStep.id}` : ''}`;
        step.completedAt = failedAt;
      }
    });
    task.status = 'FAILED'; task.error = error; task.completedAt = failedAt; task.updatedAt = failedAt; task.progress = 100; this.cancellationHandlers.delete(taskId);
    this.emitTaskEvent(taskId, 'FAILED', error); this.publishSnapshot(); return this.clone(task);
  }

  public scheduleRetry(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId); if (!task || task.status !== 'FAILED' || task.retryCount >= task.maxRetries || emergencyStop.isEmergencyStopped()) return task ? this.clone(task) : undefined;
    task.retryCount += 1; task.status = 'PENDING'; task.error = undefined; task.completedAt = undefined; task.updatedAt = Date.now();
    task.steps.forEach((step) => { step.status = 'PENDING'; step.error = undefined; step.startedAt = undefined; step.completedAt = undefined; step.resultBinding = undefined; });
    this.recalculateProgress(task); this.emitTaskEvent(taskId, 'RETRY_SCHEDULED', `Retry ${task.retryCount}/${task.maxRetries}`); this.publishSnapshot(); return this.clone(task);
  }

  public cancel(taskId: string, reason: string = 'Cancelled by user'): RuntimeTask | undefined {
    const task = this.getMutable(taskId); if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    this.cancellationHandlers.get(taskId)?.forEach((handler) => { try { handler(); } catch (error) { console.error(`[TaskRuntime] cancellation handler failed for ${taskId}`, error); } });
    this.cancellationHandlers.delete(taskId); task.status = 'CANCELLED'; task.cancellationReason = reason; task.completedAt = Date.now(); task.updatedAt = task.completedAt;
    task.steps.forEach((step) => {
      const wasRunning = step.status === 'RUNNING';
      if (step.status === 'PENDING' || wasRunning) {
        if (wasRunning && !step.resultBinding) step.resultBinding = { kind: 'CONTROL', operationId: `runtime:${step.id}`, outcome: 'CANCELLED', recordedAt: Date.now() };
        step.status = 'CANCELLED'; step.completedAt = Date.now();
      }
    });
    this.recalculateProgress(task); this.emitTaskEvent(taskId, 'CANCELLED', reason); this.publishSnapshot(); return this.clone(task);
  }

  public cancelAllActive(reason: string): void { Array.from(this.tasks.values()).filter((task) => !TERMINAL_STATES.has(task.status)).forEach((task) => this.cancel(task.id, reason)); }

  public addDependency(taskId: string, dependencyTaskId: string): boolean {
    const task = this.getMutable(taskId); if (!task || taskId === dependencyTaskId || !this.tasks.has(dependencyTaskId)) return false;
    if (!task.dependencies.includes(dependencyTaskId)) task.dependencies.push(dependencyTaskId); task.updatedAt = Date.now(); this.publishSnapshot(); return true;
  }

  public dependenciesSatisfied(taskId: string): boolean { const task = this.getMutable(taskId); if (!task) return false; return task.dependencies.every((dependencyId) => this.tasks.get(dependencyId)?.status === 'COMPLETED'); }
  public get(taskId: string): RuntimeTask | undefined { const task = this.tasks.get(taskId); return task ? this.clone(task) : undefined; }
  public snapshot(): TaskRuntimeSnapshot { const tasks = Array.from(this.tasks.values()).sort((a, b) => b.updatedAt - a.updatedAt).map((task) => this.clone(task)); return { tasks, activeTaskIds: tasks.filter((task) => !TERMINAL_STATES.has(task.status)).map((task) => task.id), updatedAt: Date.now() }; }
  public clearCompleted(): void { Array.from(this.tasks.values()).filter((task) => TERMINAL_STATES.has(task.status)).forEach((task) => this.tasks.delete(task.id)); this.publishSnapshot(); }

  public async flush(): Promise<void> {
    try { await this.storage.set('runtime', RUNTIME_STORAGE_KEY, this.snapshot()); }
    catch (error) { eventBus.emit('STORAGE_ERROR', { scope: 'TASK_RUNTIME', action: 'WRITE', error: error instanceof Error ? error.message : String(error) }); }
  }

  private normalizeRecoveredTask(task: RuntimeTask): RuntimeTask {
    const normalized: RuntimeTask = { ...task, dependencies: Array.isArray(task.dependencies) ? [...task.dependencies] : [], steps: Array.isArray(task.steps) ? task.steps.map((step) => ({ ...step, resultBinding: step.resultBinding ? { ...step.resultBinding } : undefined })) : [], retryCount: Number.isFinite(task.retryCount) ? task.retryCount : 0, maxRetries: Number.isFinite(task.maxRetries) ? task.maxRetries : 1 };
    if (!TERMINAL_STATES.has(normalized.status)) {
      const recoveredAt = Date.now(); normalized.status = 'FAILED'; normalized.error = 'Execution interrupted by application/runtime restart. Explicit retry is required.'; normalized.completedAt = recoveredAt; normalized.updatedAt = recoveredAt;
      const runningStep = normalized.steps.find((step) => step.status === 'RUNNING'); if (runningStep) { runningStep.status = 'FAILED'; runningStep.error = 'Interrupted by runtime restart'; runningStep.completedAt = recoveredAt; if (!runningStep.resultBinding) runningStep.resultBinding = { kind: 'CONTROL', operationId: `runtime:${runningStep.id}`, outcome: 'FAILED', validationStatus: 'INTERRUPTED', recordedAt: recoveredAt }; }
      normalized.steps.forEach((step) => { if (step.status === 'PENDING') { step.status = 'SKIPPED'; step.error = 'Skipped because execution was interrupted by runtime restart'; step.completedAt = recoveredAt; } });
      normalized.progress = 100;
    }
    return normalized;
  }

  private getMutable(taskId: string): RuntimeTask | undefined { return this.tasks.get(taskId); }
  private recalculateProgress(task: RuntimeTask): void { if (task.steps.length === 0) { task.progress = TERMINAL_STATES.has(task.status) ? 100 : 0; return; } const completed = task.steps.filter((step) => step.status === 'COMPLETED' || step.status === 'SKIPPED').length; task.progress = Math.round((completed / task.steps.length) * 100); }
  private publishSnapshot(): void { eventBus.emit<TaskRuntimeSnapshot>('TASK_RUNTIME_SNAPSHOT', this.snapshot()); if (this.initialized) void this.flush(); }
  private emitTaskEvent(taskId: string, type: TaskRuntimeEvent['type'], details?: string): void { const event: TaskRuntimeEvent = { taskId, type, timestamp: Date.now(), details }; eventBus.emit<TaskRuntimeEvent>('TASK_RUNTIME_EVENT', event); eventBus.emit('ACTIVITY_LOG', { timestamp: event.timestamp, message: `Task ${taskId}: ${type}${details ? ` — ${details}` : ''}`, mode: 'PROJECT' }); }
  private deriveTitle(prompt: string, mode: string): string { const normalized = prompt.trim().replace(/\s+/g, ' '); return normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized || `${mode} task`; }
  private clone(task: RuntimeTask): RuntimeTask { return { ...task, dependencies: [...task.dependencies], steps: task.steps.map((step) => ({ ...step, resultBinding: step.resultBinding ? { ...step.resultBinding } : undefined })) }; }
}

export const taskRuntime = new TaskRuntimeController();