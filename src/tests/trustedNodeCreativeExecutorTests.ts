import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MioCheckpointPersistence } from '../observability/MioCheckpointPersistence';
import { NodeFileCheckpointStorage } from '../observability/NodeFileCheckpointStorage';
import { createTrustedNodeCreativeExecutor, TrustedNodeCreativeExecutor, type TrustedCreativeCommand } from '../observability/TrustedNodeCreativeExecutor';
import type { ExclusiveNodeCheckpointRuntime } from '../observability/ExclusiveNodeCheckpointRuntime';

const assert = (x: unknown, message: string): void => { if (!x) throw new Error(message); };
const command: TrustedCreativeCommand = {
  schemaVersion: 1, projectId: 'projectA', taskId: 'taskA', requestId: 'creativeA',
  mode: '3D', templateId: 'primitive_cube_v1',
};
export async function runTrustedNodeCreativeExecutorTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['approved deterministic creative work commits to real durable checkpoint', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-creative-'));
      let authorizations = 0, executions = 0;
      try {
        const runtime = createTrustedNodeCreativeExecutor(root, {
          authorize: async () => { authorizations++; return true; },
          execute: async () => { executions++; return { assetId: 'asset_cube_1' }; },
        });
        const result = await runtime.invoke(command);
        assert(result.success && result.status === 'COMMITTED' && authorizations === 1 && executions === 1, 'trusted command failed');
        const checkpoint = await new MioCheckpointPersistence(new NodeFileCheckpointStorage(root)).load('projectA');
        assert(checkpoint.get({projectId:'projectA',taskId:'taskA',actionId:'creativeA'})?.state === 'COMMITTED', 'durable commit missing');
        assert(!(await runtime.invoke(command)).success && executions === 1, 'duplicate creative command replayed');
        runtime.close();
        const subsequent = createTrustedNodeCreativeExecutor(root, { authorize: async () => true, execute: async () => { executions++; return {assetId:'another'}; } });
        const replay = await subsequent.invoke(command);
        assert(!replay.success && executions === 1, 'disk replay admitted');
        // A failed checkpoint admission quarantines the process. Do not release its lock automatically.
      } finally { fs.rmSync(root, {recursive:true,force:true}); }
    }],
    ['rejected approval and invalid command never mutate or write checkpoints', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-creative-'));
      let executions = 0;
      try {
        const runtime = createTrustedNodeCreativeExecutor(root, {
          authorize: async () => false,
          execute: async () => { executions++; return { assetId: 'forbidden' }; },
        });
        const reject = await runtime.invoke(command);
        const invalid = await runtime.invoke({ ...command, templateId: '../escape' });
        assert(!reject.success && !invalid.success && executions === 0, 'unapproved command executed');
        assert(fs.readdirSync(path.join(root, 'mio-runtime-checkpoints-v1')).filter(x => x.endsWith('.json')).length === 0, 'checkpoint persisted before approval');
        runtime.close();
      } finally { fs.rmSync(root, {recursive:true,force:true}); }
    }],
    ['STOP during async approval prevents checkpoint and effects', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-creative-'));
      let resolveApproval!: (allowed: boolean) => void;
      const approved = new Promise<boolean>(resolve => { resolveApproval = resolve; });
      let executions = 0;
      try {
        const runtime = createTrustedNodeCreativeExecutor(root, {
          authorize: () => approved,
          execute: async () => { executions++; return { assetId: 'never' }; },
        });
        const pending = runtime.invoke(command);
        runtime.stop();
        resolveApproval(true);
        const result = await pending;
        assert(!result.success && executions === 0, 'STOP accepted pending approval');
        assert(runtime.activeCount() === 0, 'inflight slot leaked');
        runtime.close();
      } finally { fs.rmSync(root, {recursive:true,force:true}); }
    }],
    ['close refuses while running and STOP after committed effect requires review', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-creative-'));
      let completeEffect!: () => void;
      const effect = new Promise<void>(resolve => { completeEffect = resolve; });
      try {
        let started!: () => void;
        const executing = new Promise<void>(resolve => { started = resolve; });
        const runtime = createTrustedNodeCreativeExecutor(root, {
          authorize: async () => true,
          execute: async () => { started(); await effect; return { assetId: 'asset_after_stop' }; },
        });
        const pending = runtime.invoke(command);
        await executing;
        let refused = false;
        try { runtime.close(); } catch { refused = true; }
        assert(refused, 'closed active writer');
        runtime.stop();
        completeEffect();
        const result = await pending;
        assert(!result.success && result.status === 'STOPPED_REVIEW' && result.assetId === 'asset_after_stop', 'committed effect misreported after STOP');
        runtime.close();
      } finally { fs.rmSync(root, {recursive:true,force:true}); }
    }],
    ['failed native executor produces UNCERTAIN and no automatic retry', async () => {
      let settlements = 0;
      const runtimeGate: Pick<ExclusiveNodeCheckpointRuntime, 'gate'|'stop'|'activeCount'|'close'> = {
        gate: { async begin() {}, async complete(_id, confirmed) { if (!confirmed) settlements++; } },
        stop() {}, activeCount: () => 0, close() {},
      };
      let executions = 0;
      const runtime = new TrustedNodeCreativeExecutor(runtimeGate, {
        authorize: async () => true,
        execute: async () => { executions++; throw new Error('engine failed after side effect'); },
      });
      const first = await runtime.invoke(command);
      const retry = await runtime.invoke(command);
      assert(!first.success && first.status === 'UNCERTAIN' && !retry.success &&
        executions === 1 && settlements === 1, 'ambiguous creative effect replayed');
      runtime.close();
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log('✓ [PASS] '+name); }
  return { passed, total: tests.length };
}
