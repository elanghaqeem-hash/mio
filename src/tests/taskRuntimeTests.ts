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

function completeSyntheticTask(id: string): void {
  taskRuntime.start(id);
  taskRuntime.startStep(id, 'understand'); taskRuntime.completeStep(id, 'understand');
  taskRuntime.startStep(id, 'route'); taskRuntime.completeStep(id, 'route');
  taskRuntime.startStep(id, 'execute');
  taskRuntime.bindStepResult(id, 'execute', { kind: 'CONTROL', operationId: 'test.synthetic', outcome: 'SUCCESS', validationStatus: 'TEST' });
  taskRuntime.completeStep(id, 'execute');
  taskRuntime.startStep(id, 'validate'); taskRuntime.completeStep(id, 'validate');
  taskRuntime.complete(id);
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

  const orderingId = `ordering_${Date.now() + 1}`;
  taskRuntime.create(plan(orderingId), 'ordering test');
  taskRuntime.start(orderingId);
  taskRuntime.startStep(orderingId, 'execute');
  check(taskRuntime.get(orderingId)?.steps.find((step) => step.id === 'execute')?.status === 'PENDING', 'TaskRuntime blocks out-of-order step execution');
  taskRuntime.startStep(orderingId, 'understand'); taskRuntime.completeStep(orderingId, 'understand');
  taskRuntime.startStep(orderingId, 'route'); taskRuntime.completeStep(orderingId, 'route');
  taskRuntime.startStep(orderingId, 'execute');
  taskRuntime.completeStep(orderingId, 'execute');
  check(taskRuntime.get(orderingId)?.steps.find((step) => step.id === 'execute')?.status === 'RUNNING', 'Execute step cannot complete without a successful result binding');
  taskRuntime.bindStepResult(orderingId, 'execute', { kind: 'MODEL', operationId: 'local:test', outcome: 'SUCCESS', validationStatus: 'NON_EMPTY_RESPONSE' });
  taskRuntime.completeStep(orderingId, 'execute');
  check(taskRuntime.get(orderingId)?.steps.find((step) => step.id === 'execute')?.resultBinding?.operationId === 'local:test', 'Execute step retains bound operation identity');
  taskRuntime.complete(orderingId);
  check(taskRuntime.get(orderingId)?.status !== 'COMPLETED', 'TaskRuntime blocks terminal completion while planned validation step is incomplete');
  taskRuntime.startStep(orderingId, 'validate'); taskRuntime.completeStep(orderingId, 'validate'); taskRuntime.complete(orderingId);
  check(taskRuntime.get(orderingId)?.status === 'COMPLETED', 'TaskRuntime completes only after all planned steps finish');

  const dependencyId = `dependency_${Date.now() + 2}`;
  const dependentId = `dependent_${Date.now() + 3}`;
  taskRuntime.create(plan(dependencyId), 'dependency task');
  taskRuntime.create(plan(dependentId), 'dependent task');
  check(taskRuntime.addDependency(dependentId, dependencyId), 'TaskRuntime registers valid task dependencies');
  check(!taskRuntime.dependenciesSatisfied(dependentId), 'Dependent task remains blocked until dependency completes');
  completeSyntheticTask(dependencyId);
  check(taskRuntime.dependenciesSatisfied(dependentId), 'Dependency gate opens only after dependency completes');

  const retryId = `retry_${Date.now() + 4}`;
  taskRuntime.create(plan(retryId), 'retry task', undefined, 1);
  taskRuntime.start(retryId);
  taskRuntime.startStep(retryId, 'understand'); taskRuntime.completeStep(retryId, 'understand');
  taskRuntime.startStep(retryId, 'route'); taskRuntime.completeStep(retryId, 'route');
  taskRuntime.startStep(retryId, 'execute');
  taskRuntime.bindStepResult(retryId, 'execute', { kind: 'TOOL', operationId: 'test.fail', outcome: 'FAILED', validationStatus: 'FAILED' });
  taskRuntime.fail(retryId, 'synthetic failure');
  taskRuntime.scheduleRetry(retryId);
  check(taskRuntime.get(retryId)?.status === 'PENDING' && taskRuntime.get(retryId)?.retryCount === 1, 'TaskRuntime schedules retries within configured retry budget');
  check(taskRuntime.get(retryId)?.steps.every((step) => step.status === 'PENDING' && !step.resultBinding), 'Retry clears prior step state and stale result bindings before re-execution');
  taskRuntime.fail(retryId, 'second failure');
  taskRuntime.scheduleRetry(retryId);
  check(taskRuntime.get(retryId)?.retryCount === 1, 'TaskRuntime refuses retries beyond configured retry budget');

  const stopA = `stop_a_${Date.now() + 5}`;
  const stopB = `stop_b_${Date.now() + 6}`;
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
