import { MioTraceLedger } from '../observability/MioTraceLedger';
import { validateMioExecutionTrace } from '../contracts/MioContractValidation';
const ok = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const fails = (fn: () => unknown, message: string): void => {
  let failed = false;
  try { fn(); } catch { failed = true; }
  ok(failed, message);
};
export function runMioTraceLedgerTests(): { passed: number; total: number } {
  const checks: Array<[string, () => void]> = [
    ['trace lifecycle stays contract-valid and metadata-only', () => {
      const ledger = new MioTraceLedger();
      const t = ledger.begin({ traceId: 'trace:1', requestId: 'request:1', taskId: 'task:1', capabilityId: 'model.generate', projectId: 'p1' }, 10);
      ok(validateMioExecutionTrace(t).ok, 'invalid begin trace');
      const updated = ledger.append('trace:1', 'p1', { id: 'span:1', kind: 'MODEL_CALL', name: 'model.generate', status: 'SUCCEEDED', startedAt: 11, finishedAt: 12, detail: 'api-key-secret' });
      ok(!('detail' in updated.spans[0]), 'arbitrary details leaked into ledger');
      const closed = ledger.finish('trace:1', 'p1', 'SUCCEEDED', 13);
      ok(validateMioExecutionTrace(closed).ok && closed.status === 'SUCCEEDED', 'invalid finish');
      fails(() => ledger.append('trace:1', 'p1', { id: 'span:2', kind: 'TOOL_CALL', name: 'file.read', status: 'SUCCEEDED', startedAt: 14 }), 'closed trace mutated');
    }],
    ['cross-project reads writes and clears are isolated', () => {
      const ledger = new MioTraceLedger();
      ledger.begin({ traceId: 't2', requestId: 'r2', taskId: 'k2', capabilityId: 'research.search', projectId: 'private' }, 1);
      ok(ledger.get('t2', 'other') === undefined && ledger.list('other').length === 0, 'cross project read');
      fails(() => ledger.finish('t2', 'other', 'FAILED', 2), 'cross project write');
      ok(ledger.clear('other') === 0 && ledger.get('t2', 'private') !== undefined, 'cross project clear');
    }],
    ['duplicate IDs invalid times and missing parents reject', () => {
      const ledger = new MioTraceLedger();
      const identity = { traceId: 't3', requestId: 'r3', taskId: 'k3', capabilityId: 'creative.execute', projectId: 'p3' };
      ledger.begin(identity, 100);
      fails(() => ledger.begin(identity, 101), 'duplicate trace accepted');
      fails(() => ledger.append('t3', 'p3', { id: 's1', kind: 'TOOL_CALL', name: 'read', startedAt: 99, status: 'RUNNING' }), 'earlier span accepted');
      fails(() => ledger.append('t3', 'p3', { id: 's2', kind: 'TOOL_CALL', name: 'read', parentId: 'missing', startedAt: 101, status: 'RUNNING' }), 'missing parent accepted');
      fails(() => ledger.finish('t3', 'p3', 'SUCCEEDED', 99), 'earlier finish accepted');
    }],
    ['bounded retention and immutable snapshots', () => {
      const ledger = new MioTraceLedger(1);
      const first = ledger.begin({ traceId: 't4', requestId: 'r4', taskId: 'k4', capabilityId: 'voice.speak', projectId: 'p4' }, 1);
      first.spans.push({ id: 'fake', kind: 'TOOL_CALL', name: 'fake', startedAt: 2, status: 'RUNNING' });
      ok(ledger.get('t4', 'p4')?.spans.length === 0, 'mutable snapshot leaked');
      ledger.begin({ traceId: 't5', requestId: 'r5', taskId: 'k5', capabilityId: 'voice.speak', projectId: 'p4' }, 2);
      ok(ledger.get('t4', 'p4') === undefined && ledger.list('p4').length === 1, 'bounded eviction failed');
    }],
  ];
  let passed = 0;
  for (const [name, run] of checks) { run(); passed++; console.log('✓ '+name); }
  return { passed, total: checks.length };
}
