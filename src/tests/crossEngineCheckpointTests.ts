import { MIO_CONTRACT_SCHEMA_VERSION, type MioCapabilityRequest } from '../contracts/MioContracts';
import { createDefaultCapabilityProtocol } from '../capabilities/defaultCapabilityProtocol';
import { defaultCapabilityRegistry } from '../security/CapabilityRegistry';
import { ToolRouter } from '../orchestrator/tools/ToolRouter';
import { createDefaultToolRegistry } from '../orchestrator/tools/createDefaultToolRegistry';
import { MioCheckpointPersistence, type MioCheckpointStorage } from '../observability/MioCheckpointPersistence';
import { PersistentMutationCheckpointGate } from '../observability/PersistentMutationCheckpointGate';

const assert = (x: unknown, message: string) => { if (!x) throw new Error(message); };
let count = 0;
const request = (requestId: string, projectId = 'projectA'): MioCapabilityRequest => ({
  schemaVersion: MIO_CONTRACT_SCHEMA_VERSION, requestId, capabilityId: 'creative.execute',
  context: { traceId: 'trace_' + requestId, taskId: 'taskA', projectId, mode: '3D', privacy: 'LOCAL_ONLY', requestedBy: 'AGENT' },
  permission: { level: 'L5_DESTRUCTIVE', action: 'CAPABILITY:creative.execute', target: projectId },
  input: { prompt: 'red cube', requestedMode: '3D' }, createdAt: Date.now(),
});
function setup(failOnWrite = 0) {
  let writes = 0;
  const bytes = new Map<string, string>();
  const storage: MioCheckpointStorage = {
    read: async projectId => bytes.get(projectId) ?? null,
    atomicWrite: async (projectId, contents) => {
      writes++;
      if (writes === failOnWrite) throw new Error('simulated durable storage failure');
      bytes.set(projectId, contents);
    },
  };
  const gateway = new PersistentMutationCheckpointGate(new MioCheckpointPersistence(storage));
  let executions = 0;
  const protocol = createDefaultCapabilityProtocol({
    registry: defaultCapabilityRegistry, toolRouter: new ToolRouter(createDefaultToolRegistry()),
    checkpointGate: gateway,
    executors: { 'creative.execute': async () => {
      executions++;
      return { ok: true, output: { completed: true, outputAssetIds: [], steps: [] } };
    } },
  });
  return { bytes, storage, gateway, protocol, getExecutions: () => executions, getWrites: () => writes };
}
export async function runCrossEngineCheckpointTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['governed mutating capability has durable checkpoints before and after execution', async () => {
      const { protocol, bytes, getExecutions, getWrites } = setup();
      const result = await protocol.invoke(request('mutation_1'));
      assert(result.status === 'SUCCEEDED' && getExecutions() === 1 && getWrites() === 3, 'mutation did not commit through checkpoint');
      assert(bytes.get('projectA')?.includes('"COMMITTED"'), 'committed record missing');
    }],
    ['duplicate request cannot replay a committed mutation', async () => {
      const { protocol, getExecutions } = setup();
      await protocol.invoke(request('mutation_2'));
      const repeated = await protocol.invoke(request('mutation_2'));
      assert(repeated.status === 'DENIED' && getExecutions() === 1, 'idempotency replay permitted');
    }],
    ['failed durable PREPARED or EXECUTING write denies before executor', async () => {
      for (const nth of [1, 2]) {
        const { protocol, getExecutions } = setup(nth);
        const denied = await protocol.invoke(request('bad_store_' + nth));
        assert(denied.status === 'DENIED' && getExecutions() === 0, 'storage failure executed mutation');
      }
    }],
    ['failed commit write never returns SUCCESS and blocks same project', async () => {
      const { protocol, getExecutions } = setup(3);
      const outcome = await protocol.invoke(request('commit_error'));
      assert(outcome.status === 'FAILED' && outcome.error.mutationState === 'UNKNOWN' &&
        !outcome.error.retryable && getExecutions() === 1, 'ambiguous commit reported safe');
      const second = await protocol.invoke(request('followup'));
      assert(second.status === 'DENIED' && getExecutions() === 1, 'compromised session ran again');
    }],
    ['fresh gate treats persisted EXECUTING as uncertain and refuses replay', async () => {
      const { storage, protocol, getExecutions } = setup();
      await protocol.invoke(request('original'));
      const recovered = new PersistentMutationCheckpointGate(new MioCheckpointPersistence(storage));
      let rejected = false;
      try { await recovered.begin({ projectId: 'projectA', taskId: 'taskA', requestId: 'original', capabilityId: 'creative.execute' }); }
      catch { rejected = true; }
      assert(rejected && getExecutions() === 1, 'restart bypassed original checkpoint');
    }],
    ['separate project does not inherit another project idempotency scope', async () => {
      const { protocol, getExecutions } = setup();
      const first = await protocol.invoke(request('parallel_id', 'projectA'));
      const second = await protocol.invoke(request('parallel_id', 'projectB'));
      assert(first.status === 'SUCCEEDED' && second.status === 'SUCCEEDED' && getExecutions() === 2, 'cross-project action blocked');
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
