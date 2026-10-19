import { createDefaultCapabilityProtocol } from '../capabilities/defaultCapabilityProtocol';
import { MIO_CONTRACT_SCHEMA_VERSION, type MioCapabilityRequest } from '../contracts/MioContracts';
import { emergencyStop } from '../core/EmergencyStop';
import { ToolRouter } from '../orchestrator/tools/ToolRouter';
import { createDefaultToolRegistry } from '../orchestrator/tools/createDefaultToolRegistry';
import { defaultCapabilityRegistry } from '../security/CapabilityRegistry';
import type { MioMutationCheckpointGate } from '../observability/PersistentMutationCheckpointGate';

const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const request = (id: string, capabilityId = 'creative.execute'): MioCapabilityRequest => ({
  schemaVersion: MIO_CONTRACT_SCHEMA_VERSION, requestId: id, capabilityId,
  context: { taskId: 'taskSafe', traceId: 'trace_' + id, projectId: 'projectSafe', mode: '3D', requestedBy: 'AGENT', privacy: 'LOCAL_ONLY' },
  permission: { level: 'L5_DESTRUCTIVE', action: 'CAPABILITY:' + capabilityId, target: 'projectSafe' },
  input: capabilityId === 'creative.execute' ? { prompt: 'cube', requestedMode: '3D' } : {},
  createdAt: Date.now(),
});
const success = async () => ({ ok: true as const, output: { completed: true, outputAssetIds: [], steps: [] } });
const make = (gate?: MioMutationCheckpointGate, executions?: { count: number }) =>
  createDefaultCapabilityProtocol({
    registry: defaultCapabilityRegistry,
    toolRouter: new ToolRouter(createDefaultToolRegistry()),
    mutationDurability: 'REQUIRED',
    checkpointGate: gate,
    executors: { 'creative.execute': async () => { if (executions) executions.count++; return success(); } },
  });

export async function runMutationDurabilityAdmissionTests(): Promise<{ passed: number; total: number }> {
  const checks: Array<[string, () => Promise<void>]> = [
    ['REQUIRED denies mutating creative engine when no durable backend is configured', async () => {
      const count = { count: 0 };
      const result = await make(undefined, count).invoke(request('durability_missing'));
      assert(result.status === 'DENIED' && result.error.code === 'POLICY_BLOCKED' && count.count === 0, 'unsafe mutation executed');
    }],
    ['REQUIRED still permits read-only capability invocation without checkpoint', async () => {
      const outcome = await make().invoke(request('read_allowed', 'project.inspect'));
      assert(outcome.status !== 'DENIED' || outcome.error.code !== 'POLICY_BLOCKED', 'read-only request incorrectly blocked by durability');
    }],
    ['STOP during awaited checkpoint prevents execution and conservatively settles', async () => {
      const calls = { begins: 0, completes: 0, committed: false, executions: 0 };
      let resume!: () => void;
      const hold = new Promise<void>(resolve => { resume = resolve; });
      const gate: MioMutationCheckpointGate = {
        async begin() { calls.begins++; await hold; },
        async complete(_identity, committed) { calls.completes++; calls.committed = committed; },
      };
      const count = { count: 0 };
      const protocol = make(gate, count);
      const pending = protocol.invoke(request('stop_during_checkpoint'));
      await Promise.resolve();
      emergencyStop.triggerEmergencyStop('checkpoint admission test', { fromMainProcess: true });
      resume();
      const result = await pending;
      emergencyStop.reset();
      calls.executions = count.count;
      assert(result.status === 'CANCELLED' && calls.begins === 1 && calls.completes === 1 && !calls.committed && calls.executions === 0, 'STOP boundary dispatched mutation');
      assert(result.error.mutationState === 'UNKNOWN' && !result.error.retryable, 'checkpoint cancellation was reported retryable');
    }],
    ['settlement failure after STOP cannot be reported as safely cancelled', async () => {
      let resume!: () => void;
      const hold = new Promise<void>(resolve => { resume = resolve; });
      const gate: MioMutationCheckpointGate = {
        async begin() { await hold; },
        async complete() { throw new Error('disk unavailable'); },
      };
      const count = { count: 0 };
      const pending = make(gate, count).invoke(request('stop_settlement_failure'));
      await Promise.resolve();
      emergencyStop.triggerEmergencyStop('checkpoint failure test', { fromMainProcess: true });
      resume();
      const result = await pending;
      emergencyStop.reset();
      assert(result.status === 'FAILED' && result.error.mutationState === 'UNKNOWN' && count.count === 0, 'uncertain settlement incorrectly marked safe');
    }],
  ];
  let passed = 0;
  for (const [name, run] of checks) {
    try { await run(); passed++; console.log('✓ [PASS] ' + name); }
    finally { if (emergencyStop.isEmergencyStopped()) emergencyStop.reset(); }
  }
  return { passed, total: checks.length };
}
