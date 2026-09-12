import { eventBus } from '../core/EventBus';
import { ExecutionHistory } from '../orchestrator/ExecutionHistory';
import { ResourceGovernor } from '../orchestrator/ResourceGovernor';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { ResourceUsageEvent } from '../types/resources';

interface SuiteResult { passed: number; total: number; }

export async function runResourceGovernanceTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`ResourceGovernance test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const governor = new ResourceGovernor();
  const toolTask = `resource_tool_${Date.now()}`;
  governor.ensure(toolTask, { maxToolCalls: 1, maxNetworkCalls: 5, maxModelCalls: 5, maxDurationMs: 60_000 });
  governor.consumeToolCall(toolTask, false);
  let toolBlocked = false;
  try { governor.consumeToolCall(toolTask, false); } catch { toolBlocked = true; }
  check(toolBlocked && governor.get(toolTask)?.exhausted === true, 'ResourceGovernor blocks tool calls beyond the configured budget');

  const networkTask = `resource_network_${Date.now()}`;
  governor.ensure(networkTask, { maxToolCalls: 5, maxNetworkCalls: 1, maxModelCalls: 5, maxDurationMs: 60_000 });
  governor.consumeNetworkCall(networkTask);
  let networkBlocked = false;
  try { governor.consumeNetworkCall(networkTask); } catch { networkBlocked = true; }
  check(networkBlocked && governor.get(networkTask)?.usage.networkCalls === 1, 'ResourceGovernor blocks network calls before exceeding the configured limit');

  const modelTask = `resource_model_${Date.now()}`;
  governor.ensure(modelTask, { maxToolCalls: 5, maxNetworkCalls: 5, maxModelCalls: 1, maxDurationMs: 60_000 });
  governor.consumeModelCall(modelTask, false);
  let modelBlocked = false;
  try { governor.consumeModelCall(modelTask, false); } catch { modelBlocked = true; }
  check(modelBlocked && governor.get(modelTask)?.usage.modelCalls === 1, 'ResourceGovernor blocks model calls beyond the configured budget');

  const durationTask = `resource_duration_${Date.now()}`;
  governor.ensure(durationTask, { maxDurationMs: -1, maxToolCalls: 5, maxNetworkCalls: 5, maxModelCalls: 5 });
  const durationDecision = governor.authorize(durationTask, 'SCHEDULER_DISPATCH');
  check(!durationDecision.allowed && durationDecision.reason?.includes('duration limit') === true, 'ResourceGovernor blocks scheduler dispatch when duration budget is exhausted');

  const decisionTask = `resource_event_${Date.now()}`;
  const decisions: ResourceUsageEvent[] = [];
  const unsubscribe = eventBus.on<ResourceUsageEvent>('RESOURCE_USAGE', (event) => {
    if (event.taskId === decisionTask) decisions.push(event);
  });
  governor.ensure(decisionTask, { maxToolCalls: 0, maxNetworkCalls: 5, maxModelCalls: 5, maxDurationMs: 60_000 });
  try { governor.consumeToolCall(decisionTask, false); } catch { /* expected */ }
  unsubscribe();
  check(decisions.some((event) => event.decision === 'BLOCK' && event.operation === 'TOOL_CALL'), 'Resource decisions emit explicit BLOCK events for audit history');

  const storage = new InMemoryStorageProvider();
  const history = new ExecutionHistory();
  history.setStorageProvider(storage);
  await history.initialize();
  history.clear();
  const historyTask = `history_${Date.now()}`;
  eventBus.emit<ResourceUsageEvent>('RESOURCE_USAGE', {
    taskId: historyTask,
    operation: 'MODEL_CALL',
    decision: 'ALLOW',
    timestamp: Date.now(),
    state: governor.ensure(historyTask),
  });
  await history.flush();
  const reloaded = new ExecutionHistory();
  reloaded.setStorageProvider(storage);
  await reloaded.initialize();
  check(reloaded.getForTask(historyTask).some((record) => record.kind === 'RESOURCE' && record.event === 'MODEL_CALL'), 'ExecutionHistory persists task-scoped resource decisions through StorageProvider');

  return { passed, total };
}
