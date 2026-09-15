import { emergencyStop } from '../core/EmergencyStop';
import { TaskScheduler } from '../orchestrator/TaskScheduler';
import { taskRuntime } from '../orchestrator/TaskRuntime';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { TaskPlan } from '../orchestrator/TaskPlanner';
import type { TaskRuntimeSnapshot } from '../types/tasks';

interface SuiteResult { passed: number; total: number; }

const makePlan = (id: string): TaskPlan => ({
  id,
  createdAt: Date.now(),
  status: 'READY',
  primaryMode: 'CHAT',
  steps: [
    { id: 'understand', label: 'Understand', mode: 'CHAT', requiresPermission: false },
    { id: 'route', label: 'Route', mode: 'CHAT', requiresPermission: false },
    { id: 'execute', label: 'Execute', mode: 'CHAT', requiresPermission: false },
    { id: 'validate', label: 'Validate', mode: 'CHAT', requiresPermission: false },
  ],
});

const completeSyntheticTask = (id: string) => {
  taskRuntime.start(id);
  taskRuntime.startStep(id, 'understand'); taskRuntime.completeStep(id, 'understand');
  taskRuntime.startStep(id, 'route'); taskRuntime.completeStep(id, 'route');
  taskRuntime.startStep(id, 'execute');
  taskRuntime.bindStepResult(id, 'execute', { kind: 'CONTROL', operationId: 'scheduler.test', outcome: 'SUCCESS', validationStatus: 'TEST' });
  taskRuntime.completeStep(id, 'execute');
  taskRuntime.startStep(id, 'validate'); taskRuntime.completeStep(id, 'validate');
  taskRuntime.complete(id);
};

const cleanupRuntime = () => {
  emergencyStop.reset();
  taskRuntime.cancelAllActive('scheduler test cleanup');
  taskRuntime.clearCompleted();
};

export async function runTaskSchedulerTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`TaskScheduler test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  cleanupRuntime();

  const persistenceStorage = new InMemoryStorageProvider();
  taskRuntime.setStorageProvider(persistenceStorage);
  await taskRuntime.initialize();
  const persistId = `persist_${Date.now()}`;
  taskRuntime.create(makePlan(persistId), 'persist task');
  taskRuntime.start(persistId);
  await taskRuntime.flush();
  const persisted = await persistenceStorage.get<TaskRuntimeSnapshot>('runtime', 'task-runtime-v1');
  check(persisted?.tasks.some((task) => task.id === persistId && task.status === 'RUNNING') === true, 'TaskRuntime persists runtime history through StorageProvider');

  cleanupRuntime();
  const recoveryStorage = new InMemoryStorageProvider();
  const recoverId = `recover_${Date.now()}`;
  const now = Date.now();
  await recoveryStorage.set<TaskRuntimeSnapshot>('runtime', 'task-runtime-v1', {
    tasks: [{
      id: recoverId,
      title: 'Interrupted task',
      prompt: 'interrupted',
      mode: 'CHAT',
      status: 'RUNNING',
      progress: 50,
      steps: makePlan(recoverId).steps.map((step, index) => ({ ...step, status: index < 2 ? 'COMPLETED' : index === 2 ? 'RUNNING' : 'PENDING' })),
      createdAt: now - 1000,
      updatedAt: now - 500,
      startedAt: now - 800,
      retryCount: 0,
      maxRetries: 1,
      dependencies: [],
    }],
    activeTaskIds: [recoverId],
    updatedAt: now,
  });
  taskRuntime.setStorageProvider(recoveryStorage);
  await taskRuntime.initialize();
  const recovered = taskRuntime.get(recoverId);
  check(recovered?.status === 'FAILED' && recovered.error?.includes('interrupted') === true, 'Runtime restart recovers non-terminal task as FAILED instead of silently resuming execution');
  check(recovered?.steps.find((step) => step.id === 'execute')?.status === 'FAILED', 'Recovery marks interrupted running step as FAILED');
  check(recovered?.steps.find((step) => step.id === 'execute')?.resultBinding?.validationStatus === 'INTERRUPTED', 'Recovery binds interrupted execution outcome for auditability');

  cleanupRuntime();
  const scheduler = new TaskScheduler(1);
  const firstId = `concurrency_a_${Date.now()}`;
  const secondId = `concurrency_b_${Date.now()}`;
  taskRuntime.create(makePlan(firstId), 'first');
  taskRuntime.create(makePlan(secondId), 'second');

  let releaseFirst: (() => void) | undefined;
  const firstPromise = scheduler.execute(firstId, () => new Promise<string>((resolve) => {
    releaseFirst = () => { completeSyntheticTask(firstId); resolve('first'); };
  }));
  let secondStarted = false;
  const secondPromise = scheduler.execute(secondId, async () => {
    secondStarted = true;
    completeSyntheticTask(secondId);
    return 'second';
  });
  await Promise.resolve();
  check(scheduler.getActiveTaskIds().length === 1 && scheduler.getQueuedTaskIds().includes(secondId) && !secondStarted, 'Scheduler enforces configured concurrency limit');
  releaseFirst?.();
  await firstPromise;
  await secondPromise;
  check(secondStarted && taskRuntime.get(secondId)?.status === 'COMPLETED', 'Queued task dispatches after an execution slot becomes available');

  cleanupRuntime();
  const dependencyScheduler = new TaskScheduler(2);
  const dependencyId = `dep_${Date.now()}`;
  const dependentId = `dependent_${Date.now()}`;
  taskRuntime.create(makePlan(dependencyId), 'dependency');
  taskRuntime.create(makePlan(dependentId), 'dependent');
  taskRuntime.addDependency(dependentId, dependencyId);
  let dependentStarted = false;
  const dependentPromise = dependencyScheduler.execute(dependentId, async () => {
    dependentStarted = true;
    completeSyntheticTask(dependentId);
    return 'dependent';
  });
  await Promise.resolve();
  check(!dependentStarted && dependencyScheduler.getQueuedTaskIds().includes(dependentId), 'Scheduler holds dependent task while prerequisite is incomplete');
  const dependencyPromise = dependencyScheduler.execute(dependencyId, async () => {
    completeSyntheticTask(dependencyId);
    return 'dependency';
  });
  await dependencyPromise;
  await dependentPromise;
  check(dependentStarted && taskRuntime.get(dependentId)?.status === 'COMPLETED', 'Scheduler dispatches dependent task after prerequisite completion');

  cleanupRuntime();
  const retryScheduler = new TaskScheduler(1);
  const retryId = `scheduler_retry_${Date.now()}`;
  taskRuntime.create(makePlan(retryId), 'retry execution', undefined, 1);
  let attempt = 0;
  try {
    await retryScheduler.execute(retryId, async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('synthetic first failure');
      completeSyntheticTask(retryId);
      return 'success';
    });
  } catch {
    // Expected first attempt failure.
  }
  check(taskRuntime.get(retryId)?.status === 'FAILED' && retryScheduler.canRetry(retryId), 'Scheduler retains in-session runner for an eligible failed task');
  await retryScheduler.retry(retryId);
  check(attempt === 2 && taskRuntime.get(retryId)?.status === 'COMPLETED', 'Scheduler retry re-executes retained runner through the queue');

  cleanupRuntime();
  const pauseId = `pause_boundary_${Date.now()}`;
  taskRuntime.create(makePlan(pauseId), 'pause boundary');
  taskRuntime.start(pauseId);
  taskRuntime.startStep(pauseId, 'understand'); taskRuntime.completeStep(pauseId, 'understand');
  taskRuntime.startStep(pauseId, 'route'); taskRuntime.completeStep(pauseId, 'route');
  taskRuntime.startStep(pauseId, 'execute');
  taskRuntime.bindStepResult(pauseId, 'execute', { kind: 'CONTROL', operationId: 'pause.test', outcome: 'SUCCESS', validationStatus: 'TEST' });
  taskRuntime.pause(pauseId);
  taskRuntime.completeStep(pauseId, 'execute');
  check(taskRuntime.get(pauseId)?.status === 'PAUSED', 'Completing an in-flight step preserves cooperative PAUSED state');
  let resumed = false;
  const waitPromise = new TaskScheduler(1).waitUntilRunnable(pauseId).then(() => { resumed = true; });
  await Promise.resolve();
  check(!resumed, 'Scheduler blocks progression while task remains paused');
  taskRuntime.resume(pauseId);
  await waitPromise;
  check(resumed, 'Scheduler releases step progression after explicit resume');

  cleanupRuntime();
  return { passed, total };
}
