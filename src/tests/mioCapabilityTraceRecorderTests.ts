import { MioCapabilityTraceRecorder } from '../observability/MioCapabilityTraceRecorder';
import { MIO_CONTRACT_SCHEMA_VERSION, type MioCapabilityRequest, type MioCapabilityResult } from '../contracts/MioContracts';

const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
function pair(id: string, traceId = 'shared:trace', projectId = 'project:A'): [MioCapabilityRequest, MioCapabilityResult] {
  const start = 100;
  const request: MioCapabilityRequest = {
    schemaVersion: MIO_CONTRACT_SCHEMA_VERSION,
    requestId: id, capabilityId: 'project.inspect', input: {},
    context: { traceId, taskId: 'task:A', projectId, mode: 'PROJECT', privacy: 'LOCAL_ONLY', requestedBy: 'AGENT' },
    permission: { level: 'L0_OBSERVE', action: 'INSPECT', target: projectId },
    createdAt: start,
  };
  const result: MioCapabilityResult = {
    schemaVersion: MIO_CONTRACT_SCHEMA_VERSION,
    requestId: id, capabilityId: 'project.inspect', status: 'SUCCEEDED', output: {}, validation: 'PASSED',
    evidence: [], artifacts: [],
    trace: { schemaVersion: MIO_CONTRACT_SCHEMA_VERSION, traceId, taskId: 'task:A', requestId: id,
      capabilityId: 'project.inspect', startedAt: start, finishedAt: start + 2, status: 'SUCCEEDED',
      spans: [{ id: id + ':capability', kind: 'CAPABILITY_CALL', name: 'project.inspect', startedAt: start, finishedAt: start + 2, status: 'SUCCEEDED', detail: 'Bearer should-not-store' }] },
  };
  return [request, result];
}
export function runMioCapabilityTraceRecorderTests(): { passed: number; total: number } {
  const checks: Array<[string, () => void]> = [
    ['two capability results append to one project-scoped trace', () => {
      const recorder = new MioCapabilityTraceRecorder();
      const [a, ar] = pair('request:1');
      const [b, br] = pair('request:2');
      recorder.observe(a, ar); recorder.observe(b, br);
      const trace = recorder.ledger.get('shared:trace', 'project:A');
      assert(trace?.spans.length === 2 && trace.status === 'RUNNING', 'trace was not shared');
      assert(!JSON.stringify(trace).includes('should-not-store'), 'untrusted span detail persisted');
    }],
    ['cross-project records are not readable', () => {
      const recorder = new MioCapabilityTraceRecorder();
      const [req, res] = pair('request:3');
      recorder.observe(req, res);
      assert(recorder.ledger.get('shared:trace', 'project:B') === undefined, 'cross-project leak');
      assert(recorder.ledger.list('project:B').length === 0, 'cross-project list leak');
    }],
    ['mismatched context, duplicate span and missing project are harmless', () => {
      const recorder = new MioCapabilityTraceRecorder();
      const [req, res] = pair('request:4');
      recorder.observe(req, { ...res, requestId: 'other' });
      assert(recorder.ledger.list('project:A').length === 0, 'mismatch recorded');
      recorder.observe(req, res); recorder.observe(req, res);
      assert(recorder.ledger.get('shared:trace', 'project:A')?.spans.length === 1, 'duplicate recorded');
      recorder.observe({ ...req, context: { ...req.context, projectId: undefined } }, res);
      assert(recorder.ledger.get('shared:trace', 'project:A')?.spans.length === 1, 'missing project changed trace');
    }],
  ];
  let passed = 0;
  for (const [name, check] of checks) { check(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: checks.length };
}
