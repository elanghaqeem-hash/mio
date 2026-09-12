import { emergencyStop } from '../core/EmergencyStop';
import { taskRuntime } from '../orchestrator/TaskRuntime';
import type { TaskPlan } from '../orchestrator/TaskPlanner';

interface SuiteResult { passed: number; total: number; }

function plan(id: string, sensitive = false): TaskPlan {
  return {
    id,
    createdAt: Date.now(),
    status: sensitive ? 'WAITING_PERMISSION' : 'READY',
    primaryMode: 'CHAT',
    steps: [
      { id: 'understand', label: 'Understand', mode: 'CHAT', requiresPermission: false },
      { id: 'route', label: 'Route', mode: 'CHAT', requiresPermission: false },
      { id: 'execute', label: 'Execute', mode: 'CHAT', requiresPermission: sensitive },
      { id: 'validate', label: 'Validate', mode: 'CHAT', requiresPermission: false },
    ],
  };
}

export async function runTaskRuntimeTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`TaskRuntime test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  emergencyStop.reset();
  taskRuntime.clearCompleted();

  const id = `runtime_${Date.now()}`;
  taskRuntime.create(plan(id), 'test task', 'project_test');
  taskRuntime.start(id);
  taskRuntime.startStep(id, 'understand');
  taskRuntime.completeStep(id, 'understand');
  check(taskRuntime.get(id)?.progress === 25, 'TaskRuntime calculates step progress deterministically');

  taskRuntime.pause(id);
  check(taskRuntime.get(id)?.status === 'PAUSED', 'TaskRuntime pauses a running task');
  taskRuntime.resume(id);
  check(taskRuntime.get(id)?.status === 'RUNNING', 'TaskRuntime resumes a paused task when STOP MIO is not active');

  let cancellationObserved = false;
  taskRuntime.registerCancellationHandler(id, () => { cancellationObserved = true; });
  taskRuntime.cancel(id, 'unit test cancellation');
  check(cancellationObserved && taskRuntime.get(id)?.status === 'CANCELLED', 'TaskRuntime cancellation invokes registered operation abort handlers');

  const dependencyId = `dependency_${Date.now()}`;
  const dependentId = `dependent_${Date.now() + 1}`;
  taskRuntime.create(plan(dependencyId), 'dependency task');
  taskRuntime.create(plan(dependentId), 'dependent task');
  check(taskRuntime.addDependency(dependentId, dependencyId), 'TaskRuntime registers valid task dependencies');
  check(!taskRuntime.dependenciesSatisfied(dependentId), 'Dependent task remains blocked until dependency completes');
  taskRuntime.complete(dependencyId);
  check(taskRuntime.dependenciesSatisfied(dependentId), 'Dependency gate opens only after dependency completes');

  const retryId = `retry_${Date.now() + 2}`;
  taskRuntime.create(plan(retryId), 'retry task', undefined, 1);
  taskRuntime.start(retryId);
  taskRuntime.startStep(retryId, 'execute');
  taskRuntime.fail(retryId, 'synthetic failure');
  taskRuntime.scheduleRetry(retryId);
  check(taskRuntime.get(retryId)?.status === 'PENDING' && taskRuntime.get(retryId)?.retryCount === 1, 'TaskRuntime schedules retries within configured retry budget');
  taskRuntime.fail(retryId, 'second failure');
  taskRuntime.scheduleRetry(retryId);
  check(taskRuntime.get(retryId)?.retryCount === 1, 'TaskRuntime refuses retries beyond configured retry budget');

  const stopA = `stop_a_${Date.now() + 3}`;
  const stopB = `stop_b_${Date.now() + 4}`;
  taskRuntime.create(plan(stopA), 'stop task A');
  taskRuntime.create(plan(stopB), 'stop task B');
  taskRuntime.start(stopA);
  taskRuntime.start(stopB);
  emergencyStop.triggerEmergencyStop('TaskRuntime unit test');
  check(taskRuntime.get(stopA)?.status === 'CANCELLED' && taskRuntime.get(stopB)?.status === 'CANCELLED', 'STOP MIO cancels every active runtime task');
  emergencyStop.reset();

  taskRuntime.cancel(dependentId, 'test cleanup');
  taskRuntime.cancel(retryId, 'test cleanup');
  taskRuntime.clearCompleted();

  return { passed, total };
}
