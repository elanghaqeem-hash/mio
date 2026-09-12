import { eventBus } from '../core/EventBus';
import { emergencyStop } from '../core/EmergencyStop';
import { taskRuntime } from './TaskRuntime';
import type { TaskRuntimeSnapshot } from '../types/tasks';

type QueueRunner<T> = () => Promise<T>;

interface QueueEntry<T = unknown> {
  taskId: string;
  runner: QueueRunner<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  enqueuedAt: number;
}

export class TaskScheduler {
  private readonly queue: QueueEntry[] = [];
  private readonly active = new Set<string>();
  private concurrencyLimit: number;

  constructor(concurrencyLimit: number = 2) {
    this.concurrencyLimit = Math.max(1, Math.floor(concurrencyLimit));
    eventBus.on<TaskRuntimeSnapshot>('TASK_RUNTIME_SNAPSHOT', () => this.pump());
    eventBus.on<{ taskId: string; type: string }>('TASK_RUNTIME_EVENT', (event) => {
      if (event.type === 'CANCELLED') this.rejectQueuedTask(event.taskId, new Error('Task cancelled before scheduled execution'));
    });
    emergencyStop.registerAbortHandler(() => this.rejectAllQueued(new Error('STOP MIO cancelled queued execution')));
  }

  public setConcurrencyLimit(limit: number): void {
    this.concurrencyLimit = Math.max(1, Math.floor(limit));
    this.pump();
  }

  public getConcurrencyLimit(): number { return this.concurrencyLimit; }
  public getActiveTaskIds(): string[] { return Array.from(this.active); }
  public getQueuedTaskIds(): string[] { return this.queue.map((entry) => entry.taskId); }

  public execute<T>(taskId: string, runner: QueueRunner<T>): Promise<T> {
    if (emergencyStop.isEmergencyStopped()) return Promise.reject(new Error('STOP MIO is active'));
    if (!taskRuntime.get(taskId)) return Promise.reject(new Error(`Unknown runtime task '${taskId}'`));
    if (this.active.has(taskId) || this.queue.some((entry) => entry.taskId === taskId)) {
      return Promise.reject(new Error(`Task '${taskId}' is already scheduled`));
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ taskId, runner, resolve, reject, enqueuedAt: Date.now() });
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Task ${taskId}: QUEUED`, mode: 'PROJECT' });
      this.pump();
    });
  }

  public scheduleRetry<T>(taskId: string, runner: QueueRunner<T>): Promise<T> {
    const scheduled = taskRuntime.scheduleRetry(taskId);
    if (!scheduled || scheduled.status !== 'PENDING') return Promise.reject(new Error(`Retry unavailable for task '${taskId}'`));
    return this.execute(taskId, runner);
  }

  private pump(): void {
    if (emergencyStop.isEmergencyStopped()) return;

    for (let index = 0; index < this.queue.length && this.active.size < this.concurrencyLimit;) {
      const entry = this.queue[index];
      const runtimeTask = taskRuntime.get(entry.taskId);

      if (!runtimeTask || runtimeTask.status === 'CANCELLED') {
        this.queue.splice(index, 1);
        entry.reject(new Error('Task is no longer executable'));
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
      void this.runEntry(entry);
    }
  }

  private async runEntry<T>(entry: QueueEntry<T>): Promise<void> {
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
      this.pump();
    }
  }

  private rejectQueuedTask(taskId: string, error: Error): void {
    const index = this.queue.findIndex((entry) => entry.taskId === taskId);
    if (index < 0) return;
    const [entry] = this.queue.splice(index, 1);
    entry.reject(error);
  }

  private rejectAllQueued(error: Error): void {
    const pending = this.queue.splice(0, this.queue.length);
    pending.forEach((entry) => entry.reject(error));
  }
}

export const taskScheduler = new TaskScheduler(2);
