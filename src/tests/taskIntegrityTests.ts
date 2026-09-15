import { TaskIntegrity } from '../orchestrator/TaskIntegrity';
import type { RuntimeTask } from '../types/tasks';

interface Result { name: string; passed: boolean; error?: string }
function assert(condition: unknown, message: string): void { if (!condition) throw new Error(message); }
async function test(name: string, fn: () => void): Promise<Result> { try { fn(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } }

function healthyTask(): RuntimeTask {
  const now = Date.now();
  return {
    id: 'integrity_healthy', title: 'Healthy task', prompt: 'healthy', mode: 'CHAT', status: 'COMPLETED', progress: 100,
    steps: [
      { id: 'understand', label: 'Understand', mode: 'CHAT', requiresPermission: false, status: 'COMPLETED', startedAt: now - 400, completedAt: now - 350 },
      { id: 'route', label: 'Route', mode: 'CHAT', requiresPermission: false, status: 'COMPLETED', startedAt: now - 300, completedAt: now - 250 },
      { id: 'execute', label: 'Execute', mode: 'CHAT', requiresPermission: false, status: 'COMPLETED', startedAt: now - 200, completedAt: now - 150, resultBinding: { kind: 'MODEL', operationId: 'local:test', outcome: 'SUCCESS', validationStatus: 'NON_EMPTY_RESPONSE', recordedAt: now - 160 } },
      { id: 'validate', label: 'Validate', mode: 'CHAT', requiresPermission: false, status: 'COMPLETED', startedAt: now - 100, completedAt: now - 50 },
    ],
    createdAt: now - 500, updatedAt: now, startedAt: now - 450, completedAt: now, retryCount: 0, maxRetries: 1, dependencies: [],
  };
}

export async function runTaskIntegrityTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];
  results.push(await test('Healthy completed task passes deterministic integrity inspection', () => {
    const report = TaskIntegrity.inspect(healthyTask());
    assert(report.valid && report.issues.length === 0, 'healthy task should be valid');
  }));
  results.push(await test('Completed task with pending step is detected as inconsistent', () => {
    const task = healthyTask(); task.steps[3].status = 'PENDING'; task.progress = 75;
    const report = TaskIntegrity.inspect(task);
    assert(!report.valid && report.issues.some((issue) => issue.code === 'TERMINAL_WITH_INCOMPLETE_STEP'), 'missing terminal-step issue');
  }));
  results.push(await test('Completed execute step without successful result binding is rejected', () => {
    const task = healthyTask(); task.steps[2].resultBinding = undefined;
    const report = TaskIntegrity.inspect(task);
    assert(!report.valid && report.issues.some((issue) => issue.code === 'EXECUTE_COMPLETED_WITHOUT_SUCCESS_BINDING'), 'missing result-binding issue');
  }));
  results.push(await test('Multiple simultaneous running steps are detected', () => {
    const task = healthyTask(); task.status = 'RUNNING'; task.completedAt = undefined; task.steps[2].status = 'RUNNING'; task.steps[3].status = 'RUNNING'; task.progress = 50;
    const report = TaskIntegrity.inspect(task);
    assert(!report.valid && report.issues.some((issue) => issue.code === 'MULTIPLE_RUNNING_STEPS'), 'multiple running steps not detected');
  }));
  results.push(await test('Progress mismatch is surfaced without fabricating execution failure', () => {
    const task = healthyTask(); task.progress = 25;
    const report = TaskIntegrity.inspect(task);
    assert(report.valid && report.issues.some((issue) => issue.code === 'PROGRESS_MISMATCH' && issue.severity === 'WARNING'), 'progress mismatch warning missing');
  }));
  results.push(await test('Inverted step timestamps are detected as integrity errors', () => {
    const task = healthyTask(); task.steps[1].startedAt = 200; task.steps[1].completedAt = 100;
    const report = TaskIntegrity.inspect(task);
    assert(!report.valid && report.issues.some((issue) => issue.code === 'STEP_TIME_INVERSION'), 'time inversion not detected');
  }));
  results.push(await test('Integrity disclosure does not claim business-result correctness', () => {
    const report = TaskIntegrity.inspect(healthyTask());
    assert(report.disclosure.includes('not correctness of the underlying business result'), 'truthfulness disclosure missing');
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
