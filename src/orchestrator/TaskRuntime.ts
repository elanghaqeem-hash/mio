import { eventBus } from '../core/EventBus';
import { emergencyStop } from '../core/EmergencyStop';
import type { TaskPlan } from './TaskPlanner';
import type { RuntimeTask, RuntimeTaskStep, TaskRuntimeEvent, TaskRuntimeSnapshot, TaskRuntimeStatus } from '../types/tasks';

const TERMINAL_STATES = new Set<TaskRuntimeStatus>(['COMPLETED', 'FAILED', 'CANCELLED']);

class TaskRuntimeController {
  private readonly tasks = new Map<string, RuntimeTask>();
  private readonly cancellationHandlers = new Map<string, Set<() => void>>();

  constructor() {
    emergencyStop.registerAbortHandler(() => {
      this.cancelAllActive('STOP MIO / Emergency Stop');
    });
  }

  public create(plan: TaskPlan, prompt: string, projectId?: string, maxRetries: number = 1): RuntimeTask {
    const now = Date.now();
    const task: RuntimeTask = {
      id: plan.id,
      title: this.deriveTitle(prompt, plan.primaryMode),
      prompt,
      mode: plan.primaryMode,
      projectId,
      status: plan.status === 'WAITING_PERMISSION' ? 'WAITING_PERMISSION' : 'PENDING',
      progress: 0,
      steps: plan.steps.map((step): RuntimeTaskStep => ({ ...step, status: 'PENDING' })),
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries,
      dependencies: [],
    };
    this.tasks.set(task.id, task);
    this.emitTaskEvent(task.id, 'CREATED');
    this.publishSnapshot();
    return this.clone(task);
  }

  public registerCancellationHandler(taskId: string, handler: () => void): () => void {
    if (!this.cancellationHandlers.has(taskId)) this.cancellationHandlers.set(taskId, new Set());
    this.cancellationHandlers.get(taskId)!.add(handler);
    return () => {
      const handlers = this.cancellationHandlers.get(taskId);
      handlers?.delete(handler);
      if (handlers?.size === 0) this.cancellationHandlers.delete(taskId);
    };
  }

  public isCancelled(taskId: string): boolean {
    return this.tasks.get(taskId)?.status === 'CANCELLED';
  }

  public start(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId);
    if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    task.status = 'RUNNING'; task.startedAt ??= Date.now(); task.updatedAt = Date.now();
    this.emitTaskEvent(taskId, 'STARTED'); this.publishSnapshot(); return this.clone(task);
  }

  public waitForPermission(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId);
    if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    task.status = 'WAITING_PERMISSION'; task.updatedAt = Date.now();
    this.emitTaskEvent(taskId, 'WAITING_PERMISSION'); this.publishSnapshot(); return this.clone(task);
  }

  public pause(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId);
    if (!task || task.status !== 'RUNNING') return task ? this.clone(task) : undefined;
    task.status = 'PAUSED'; task.updatedAt = Date.now();
    this.emitTaskEvent(taskId, 'PAUSED'); this.publishSnapshot(); return this.clone(task);
  }

  public resume(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId);
    if (!task || task.status !== 'PAUSED' || emergencyStop.isEmergencyStopped()) return task ? this.clone(task) : undefined;
    task.status = 'RUNNING'; task.updatedAt = Date.now();
    this.emitTaskEvent(taskId, 'RESUMED'); this.publishSnapshot(); return this.clone(task);
  }

  public startStep(taskId: string, stepId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId);
    if (!task || TERMINAL_STATES.has(task.status) || task.status === 'PAUSED') return task ? this.clone(task) : undefined;
    const step = task.steps.find((item) => item.id === stepId);
    if (!step) return this.clone(task);
    task.status = step.requiresPermission && task.status === 'WAITING_PERMISSION' ? 'WAITING_PERMISSION' : 'RUNNING';
    step.status = 'RUNNING'; step.startedAt ??= Date.now(); task.updatedAt = Date.now();
    this.recalculateProgress(task); this.emitTaskEvent(taskId, 'STEP_STARTED', step.label); this.publishSnapshot(); return this.clone(task);
  }

  public completeStep(taskId: string, stepId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId);
    if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    const step = task.steps.find((item) => item.id === stepId);
    if (!step) return this.clone(task);
    step.status = 'COMPLETED'; step.completedAt = Date.now(); task.status = 'RUNNING'; task.updatedAt = Date.now();
    this.recalculateProgress(task); this.emitTaskEvent(taskId, 'STEP_COMPLETED', step.label); this.publishSnapshot(); return this.clone(task);
  }

  public complete(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId);
    if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    task.steps.forEach((step) => { if (step.status === 'PENDING' || step.status === 'RUNNING') { step.status = 'COMPLETED'; step.completedAt = Date.now(); } });
    task.status = 'COMPLETED'; task.progress = 100; task.completedAt = Date.now(); task.updatedAt = task.completedAt;
    this.cancellationHandlers.delete(taskId);
    this.emitTaskEvent(taskId, 'COMPLETED'); this.publishSnapshot(); return this.clone(task);
  }

  public fail(taskId: string, error: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId);
    if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    const runningStep = task.steps.find((step) => step.status === 'RUNNING');
    if (runningStep) { runningStep.status = 'FAILED'; runningStep.error = error; runningStep.completedAt = Date.now(); }
    task.status = 'FAILED'; task.error = error; task.completedAt = Date.now(); task.updatedAt = task.completedAt;
    this.cancellationHandlers.delete(taskId);
    this.recalculateProgress(task); this.emitTaskEvent(taskId, 'FAILED', error); this.publishSnapshot(); return this.clone(task);
  }

  public scheduleRetry(taskId: string): RuntimeTask | undefined {
    const task = this.getMutable(taskId);
    if (!task || task.status !== 'FAILED' || task.retryCount >= task.maxRetries || emergencyStop.isEmergencyStopped()) return task ? this.clone(task) : undefined;
    task.retryCount += 1; task.status = 'PENDING'; task.error = undefined; task.completedAt = undefined; task.updatedAt = Date.now();
    task.steps.forEach((step) => { if (step.status === 'FAILED' || step.status === 'RUNNING') { step.status = 'PENDING'; step.error = undefined; step.startedAt = undefined; step.completedAt = undefined; } });
    this.recalculateProgress(task); this.emitTaskEvent(taskId, 'RETRY_SCHEDULED', `Retry ${task.retryCount}/${task.maxRetries}`); this.publishSnapshot(); return this.clone(task);
  }

  public cancel(taskId: string, reason: string = 'Cancelled by user'): RuntimeTask | undefined {
    const task = this.getMutable(taskId);
    if (!task || TERMINAL_STATES.has(task.status)) return task ? this.clone(task) : undefined;
    this.cancellationHandlers.get(taskId)?.forEach((handler) => { try { handler(); } catch (error) { console.error(`[TaskRuntime] cancellation handler failed for ${taskId}`, error); } });
    this.cancellationHandlers.delete(taskId);
    task.status = 'CANCELLED'; task.cancellationReason = reason; task.completedAt = Date.now(); task.updatedAt = task.completedAt;
    task.steps.forEach((step) => { if (step.status === 'PENDING' || step.status === 'RUNNING') { step.status = 'CANCELLED'; step.completedAt = Date.now(); } });
    this.recalculateProgress(task); this.emitTaskEvent(taskId, 'CANCELLED', reason); this.publishSnapshot(); return this.clone(task);
  }

  public cancelAllActive(reason: string): void {
    Array.from(this.tasks.values()).filter((task) => !TERMINAL_STATES.has(task.status)).forEach((task) => this.cancel(task.id, reason));
  }

  public addDependency(taskId: string, dependencyTaskId: string): boolean {
    const task = this.getMutable(taskId);
    if (!task || taskId === dependencyTaskId || !this.tasks.has(dependencyTaskId)) return false;
    if (!task.dependencies.includes(dependencyTaskId)) task.dependencies.push(dependencyTaskId);
    task.updatedAt = Date.now(); this.publishSnapshot(); return true;
  }

  public dependenciesSatisfied(taskId: string): boolean {
    const task = this.getMutable(taskId); if (!task) return false;
    return task.dependencies.every((dependencyId) => this.tasks.get(dependencyId)?.status === 'COMPLETED');
  }

  public get(taskId: string): RuntimeTask | undefined { const task = this.tasks.get(taskId); return task ? this.clone(task) : undefined; }

  public snapshot(): TaskRuntimeSnapshot {
    const tasks = Array.from(this.tasks.values()).sort((a, b) => b.updatedAt - a.updatedAt).map((task) => this.clone(task));
    return { tasks, activeTaskIds: tasks.filter((task) => !TERMINAL_STATES.has(task.status)).map((task) => task.id), updatedAt: Date.now() };
  }

  public clearCompleted(): void {
    Array.from(this.tasks.values()).filter((task) => TERMINAL_STATES.has(task.status)).forEach((task) => this.tasks.delete(task.id));
    this.publishSnapshot();
  }

  private getMutable(taskId: string): RuntimeTask | undefined { return this.tasks.get(taskId); }
  private recalculateProgress(task: RuntimeTask): void {
    if (task.steps.length === 0) { task.progress = TERMINAL_STATES.has(task.status) ? 100 : 0; return; }
    const completed = task.steps.filter((step) => step.status === 'COMPLETED' || step.status === 'SKIPPED').length;
    task.progress = Math.round((completed / task.steps.length) * 100);
  }
  private publishSnapshot(): void { eventBus.emit<TaskRuntimeSnapshot>('TASK_RUNTIME_SNAPSHOT', this.snapshot()); }
  private emitTaskEvent(taskId: string, type: TaskRuntimeEvent['type'], details?: string): void {
    const event: TaskRuntimeEvent = { taskId, type, timestamp: Date.now(), details };
    eventBus.emit<TaskRuntimeEvent>('TASK_RUNTIME_EVENT', event);
    eventBus.emit('ACTIVITY_LOG', { timestamp: event.timestamp, message: `Task ${taskId}: ${type}${details ? ` — ${details}` : ''}`, mode: 'PROJECT' });
  }
  private deriveTitle(prompt: string, mode: string): string {
    const normalized = prompt.trim().replace(/\s+/g, ' '); const compact = normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized;
    return compact || `${mode} task`;
  }
  private clone(task: RuntimeTask): RuntimeTask { return { ...task, dependencies: [...task.dependencies], steps: task.steps.map((step) => ({ ...step })) }; }
}

export const taskRuntime = new TaskRuntimeController();
