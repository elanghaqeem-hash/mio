import { eventBus } from '../core/EventBus';
import { emergencyStop } from '../core/EmergencyStop';
import { taskRuntime } from './TaskRuntime';
import type { TaskRuntimeSnapshot } from '../types/tasks';

type QueueRunner<T> = () => Promise<T>;

interface QueueEntry {
  taskId: string;
  runner: QueueRunner<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  enqueuedAt: number;
}

export interface TaskSchedulerSnapshot {
  queuedTaskIds: string[];
  activeTaskIds: string[];
  concurrencyLimit: number;
  updatedAt: number;
}

export class TaskScheduler {
  private readonly queue: QueueEntry[] = [];
  private readonly active = new Set<string>();
  private readonly runnerRegistry = new Map<string, QueueRunner<unknown>>();
  private concurrencyLimit: number;

  constructor(concurrencyLimit: number = 2) {
    this.concurrencyLimit = Math.max(1, Math.floor(concurrencyLimit));
    eventBus.on<TaskRuntimeSnapshot>('TASK_RUNTIME_SNAPSHOT', () => this.pump());
    eventBus.on<{ taskId: string; type: string }>('TASK_RUNTIME_EVENT', (event) => {
      if (event.type === 'CANCELLED') this.rejectQueuedTask(event.taskId, new Error('Task cancelled before scheduled execution'));
      if (event.type === 'COMPLETED' || event.type === 'CANCELLED') this.runnerRegistry.delete(event.taskId);
    });
    emergencyStop.registerAbortHandler(() => this.rejectAllQueued(new Error('STOP MIO cancelled queued execution')));
  }

  public setConcurrencyLimit(limit: number): void {
    this.concurrencyLimit = Math.max(1, Math.floor(limit));
    this.publish();
    this.pump();
  }

  public getConcurrencyLimit(): number { return this.concurrencyLimit; }
  public getActiveTaskIds(): string[] { return Array.from(this.active); }
  public getQueuedTaskIds(): string[] { return this.queue.map((entry) => entry.taskId); }
  public canRetry(taskId: string): boolean { return this.runnerRegistry.has(taskId) && taskRuntime.get(taskId)?.status === 'FAILED'; }
  public snapshot(): TaskSchedulerSnapshot {
    return {
      queuedTaskIds: this.getQueuedTaskIds(),
      activeTaskIds: this.getActiveTaskIds(),
      concurrencyLimit: this.concurrencyLimit,
      updatedAt: Date.now(),
    };
  }

  public execute<T>(taskId: string, runner: QueueRunner<T>): Promise<T> {
    if (emergencyStop.isEmergencyStopped()) return Promise.reject(new Error('STOP MIO is active'));
    if (!taskRuntime.get(taskId)) return Promise.reject(new Error(`Unknown runtime task '${taskId}'`));
    if (this.active.has(taskId) || this.queue.some((entry) => entry.taskId === taskId)) {
      return Promise.reject(new Error(`Task '${taskId}' is already scheduled`));
    }
    this.runnerRegistry.set(taskId, runner as QueueRunner<unknown>);
    return this.enqueue(taskId, runner);
  }

  public retry<T = unknown>(taskId: string): Promise<T> {
    const runner = this.runnerRegistry.get(taskId) as QueueRunner<T> | undefined;
    if (!runner) {
      return Promise.reject(new Error('Retry runner is unavailable after restart; re-submit the directive to create a new authorized execution.'));
    }
    const scheduled = taskRuntime.scheduleRetry(taskId);
    if (!scheduled || scheduled.status !== 'PENDING') return Promise.reject(new Error(`Retry unavailable for task '${taskId}'`));
    return this.enqueue(taskId, runner);
  }

  public async waitUntilRunnable(taskId: string): Promise<void> {
    const current = taskRuntime.get(taskId);
    if (!current) throw new Error(`Unknown runtime task '${taskId}'`);
    if (current.status === 'CANCELLED') throw new Error('Task cancelled');
    if (current.status !== 'PAUSED') return;

    await new Promise<void>((resolve, reject) => {
      const unsubscribe = eventBus.on<TaskRuntimeSnapshot>('TASK_RUNTIME_SNAPSHOT', (snapshot) => {
        const task = snapshot.tasks.find((item) => item.id === taskId);
        if (!task || task.status === 'CANCELLED' || task.status === 'FAILED') {
          unsubscribe();
          reject(new Error(task?.error ?? 'Task stopped while paused'));
          return;
        }
        if (task.status !== 'PAUSED') {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  private enqueue<T>(taskId: string, runner: QueueRunner<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry = {
        taskId,
        runner: runner as QueueRunner<unknown>,
        resolve: (value) => resolve(value as T),
        reject,
        enqueuedAt: Date.now(),
      };
      this.queue.push(entry);
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Task ${taskId}: QUEUED`, mode: 'PROJECT' });
      this.publish();
      this.pump();
    });
  }

  private pump(): void {
    if (emergencyStop.isEmergencyStopped()) return;
    let changed = false;
    for (let index = 0; index < this.queue.length && this.active.size < this.concurrencyLimit;) {
      const entry = this.queue[index];
      const runtimeTask = taskRuntime.get(entry.taskId);
      if (!runtimeTask || runtimeTask.status === 'CANCELLED') {
        this.queue.splice(index, 1);
        entry.reject(new Error('Task is no longer executable'));
        changed = true;
        continue;
      }
      if (runtimeTask.status === 'PAUSED' || !taskRuntime.dependenciesSatisfied(entry.taskId)) {
        index += 1;
        continue;
      }
      this.queue.splice(index, 1);
      this.active.add(entry.taskId);
      taskRuntime.start(entry.taskId);
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Task ${entry.taskId}: DISPATCHED`, mode: 'PROJECT' });
      changed = true;
      void this.runEntry(entry);
    }
    if (changed) this.publish();
  }

  private async runEntry(entry: QueueEntry): Promise<void> {
    try {
      const value = await entry.runner();
      entry.resolve(value);
    } catch (error) {
      if (!taskRuntime.isCancelled(entry.taskId) && taskRuntime.get(entry.taskId)?.status !== 'FAILED') {
        taskRuntime.fail(entry.taskId, error instanceof Error ? error.message : String(error));
      }
      entry.reject(error);
    } finally {
      this.active.delete(entry.taskId);
      this.publish();
      this.pump();
    }
  }

  private rejectQueuedTask(taskId: string, error: Error): void {
    const index = this.queue.findIndex((entry) => entry.taskId === taskId);
    if (index < 0) return;
    const [entry] = this.queue.splice(index, 1);
    entry.reject(error);
    this.publish();
  }

  private rejectAllQueued(error: Error): void {
    const pending = this.queue.splice(0, this.queue.length);
    pending.forEach((entry) => entry.reject(error));
    this.publish();
  }

  private publish(): void {
    eventBus.emit<TaskSchedulerSnapshot>('TASK_SCHEDULER_UPDATED', this.snapshot());
  }
}

export const taskScheduler = new TaskScheduler(2);
