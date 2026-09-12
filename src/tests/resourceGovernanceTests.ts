import { eventBus } from '../core/EventBus';
import { ExecutionLedgerController } from '../security/ExecutionLedger';
import { ResourceGovernorController } from '../security/ResourceGovernor';
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

  const governor = new ResourceGovernorController();

  const toolTask = `resource_tool_${Date.now()}`;
  governor.registerTask(toolTask, 'CHAT', { maxToolCalls: 1, maxNetworkCalls: 5, maxModelCalls: 5, maxDurationMs: 60_000 });
  const firstTool = governor.consumeToolCall(toolTask, false, 'CHAT');
  const secondTool = governor.consumeToolCall(toolTask, false, 'CHAT');
  check(firstTool.allowed && !secondTool.allowed && governor.get(toolTask)?.usage.toolCalls === 1, 'ResourceGovernor blocks tool calls before exceeding the configured budget');

  const networkTask = `resource_network_${Date.now()}`;
  governor.registerTask(networkTask, 'RESEARCH', { maxToolCalls: 5, maxNetworkCalls: 1, maxModelCalls: 5, maxDurationMs: 60_000 });
  const firstNetwork = governor.consume(networkTask, 'NETWORK_CALL', 'RESEARCH');
  const secondNetwork = governor.consume(networkTask, 'NETWORK_CALL', 'RESEARCH');
  check(firstNetwork.allowed && !secondNetwork.allowed && governor.get(networkTask)?.usage.networkCalls === 1, 'ResourceGovernor blocks network calls before exceeding the configured limit');

  const modelTask = `resource_model_${Date.now()}`;
  governor.registerTask(modelTask, 'CHAT', { maxToolCalls: 5, maxNetworkCalls: 5, maxModelCalls: 1, maxDurationMs: 60_000 });
  const firstModel = governor.consumeModelCall(modelTask, false, 'CHAT');
  const secondModel = governor.consumeModelCall(modelTask, false, 'CHAT');
  check(firstModel.allowed && !secondModel.allowed && governor.get(modelTask)?.usage.modelCalls === 1, 'ResourceGovernor blocks model calls before exceeding the configured budget');

  const atomicTask = `resource_atomic_${Date.now()}`;
  governor.registerTask(atomicTask, 'RESEARCH', { maxToolCalls: 2, maxNetworkCalls: 0, maxModelCalls: 5, maxDurationMs: 60_000 });
  const atomicDecision = governor.consumeToolCall(atomicTask, true, 'RESEARCH');
  check(!atomicDecision.allowed && governor.get(atomicTask)?.usage.toolCalls === 0 && governor.get(atomicTask)?.usage.networkCalls === 0, 'Network-backed tool consumption is atomic when network budget is exhausted');

  const durationTask = `resource_duration_${Date.now()}`;
  governor.registerTask(durationTask, 'CHAT', { maxDurationMs: -1, maxToolCalls: 5, maxNetworkCalls: 5, maxModelCalls: 5 });
  const durationDecision = governor.authorize(durationTask, 'SCHEDULER_DISPATCH', 'CHAT');
  check(!durationDecision.allowed && durationDecision.reason?.includes('duration') === true, 'ResourceGovernor blocks scheduler dispatch when duration budget is exhausted');

  const decisionTask = `resource_event_${Date.now()}`;
  const decisions: ResourceUsageEvent[] = [];
  const unsubscribe = eventBus.on<ResourceUsageEvent>('RESOURCE_USAGE_EVENT', (event) => {
    if (event.taskId === decisionTask) decisions.push(event);
  });
  governor.registerTask(decisionTask, 'CHAT', { maxToolCalls: 0, maxNetworkCalls: 5, maxModelCalls: 5, maxDurationMs: 60_000 });
  governor.consumeToolCall(decisionTask, false, 'CHAT');
  unsubscribe();
  check(decisions.some((event) => event.decision === 'BLOCK' && event.operation === 'TOOL_CALL'), 'Resource decisions emit explicit BLOCK events for audit history');

  const storage = new InMemoryStorageProvider();
  const ledger = new ExecutionLedgerController();
  ledger.setStorageProvider(storage);
  await ledger.initialize();
  ledger.clear();
  const historyTask = `ledger_${Date.now()}`;
  eventBus.emit<ResourceUsageEvent>('RESOURCE_USAGE_EVENT', {
    taskId: historyTask,
    operation: 'MODEL_CALL',
    decision: 'ALLOW',
    timestamp: Date.now(),
    state: governor.registerTask(historyTask, 'CHAT'),
  });
  await ledger.flush();
  const reloaded = new ExecutionLedgerController();
  reloaded.setStorageProvider(storage);
  await reloaded.initialize();
  check(reloaded.getForTask(historyTask).some((record) => record.category === 'RESOURCE' && record.action === 'MODEL_CALL'), 'ExecutionLedger persists task-scoped resource decisions through StorageProvider');

  const resetTask = `resource_retry_${Date.now()}`;
  governor.registerTask(resetTask, 'CHAT', { maxToolCalls: 1 });
  governor.consumeToolCall(resetTask, false, 'CHAT');
  governor.resetTask(resetTask);
  check(governor.get(resetTask)?.usage.toolCalls === 0 && governor.get(resetTask)?.exhausted === false, 'Retry resource reset preserves budget while resetting usage counters');

  return { passed, total };
}
