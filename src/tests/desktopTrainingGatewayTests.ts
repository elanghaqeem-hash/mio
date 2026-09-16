import { createDefaultCapabilityRegistry } from '../security/CapabilityRegistry';
import {
  buildDesktopTrainingScopePath,
  cancelGovernedDesktopTrainingJob,
  createDesktopTrainingGateway,
  getGovernedDesktopTrainingJob,
  listGovernedDesktopTrainingJobs,
  type DesktopTrainingBridge,
  type DesktopTrainingJobSnapshot,
  type DesktopTrainingStartInput,
} from '../platform/desktop/DesktopTrainingGateway';

interface SuiteResult { passed: number; total: number; }

function job(state: DesktopTrainingJobSnapshot['state'] = 'RUNNING'): DesktopTrainingJobSnapshot {
  return {
    schemaVersion: 1,
    id: 'training-job:1000:123e4567-e89b-12d3-a456-426614174000',
    state,
    mode: 'DRY_RUN',
    pythonRuntime: 'python',
    workspaceId: 'ws_training-test',
    bundleRelativePath: 'bundle',
    startedAt: 1_000,
    stdoutTail: 'MIO TRAINING BUNDLE: VERIFIED',
    stderrTail: '',
    disclosure: 'Governed local runner test snapshot.',
  };
}

export async function runDesktopTrainingGatewayTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`DesktopTrainingGateway test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const defaultRegistry = createDefaultCapabilityRegistry();
  check(defaultRegistry.get('service.desktop.training.start')?.availability === 'UNAVAILABLE', 'Training execution capability is fail-closed outside the desktop runtime');

  const desktopRegistry = createDefaultCapabilityRegistry({ desktopTrainingBridge: true });
  const descriptor = desktopRegistry.get('service.desktop.training.start');
  check(
    descriptor?.availability === 'AVAILABLE'
      && descriptor.permissionLevel === 'L4_EXECUTE'
      && descriptor.riskLevel === 'HIGH'
      && descriptor.networkAccess === false
      && descriptor.modes.length === 1
      && descriptor.modes[0] === 'SETTINGS',
    'Desktop training start is a SETTINGS-only HIGH-risk L4 execution capability with no declared network access',
  );

  let starts = 0;
  const bridge: DesktopTrainingBridge = {
    startTrainingJob: async () => { starts += 1; return { success: true, job: job() }; },
    getTrainingJob: async () => ({ success: true, job: job() }),
    listTrainingJobs: async () => ({ success: true, jobs: [job(), job('SUCCEEDED')] }),
    cancelTrainingJob: async () => ({ success: true, job: job('CANCELLED') }),
  };
  const gateway = createDesktopTrainingGateway(bridge);
  check(gateway.has('service.desktop.training.start'), 'Fixed-entrypoint training start registers only through SecureServiceGateway');

  const invalidInput = await gateway.execute('service.desktop.training.start', {
    workspaceId: 'ws_training-test',
    bundleRelativePath: 'bundle',
    outputRelativePath: '../escape',
    pythonRuntime: 'bash',
    mode: 'TRAIN',
  }, {
    taskId: 'training_invalid_input',
    mode: 'SETTINGS',
    requestedBy: 'USER',
    resourceId: 'ws_training-test',
    path: 'invalid',
  });
  check(!invalidInput.success && invalidInput.error?.includes('input validation') === true && starts === 0, 'Invalid runtime/input is rejected before permission or IPC execution');

  const input: DesktopTrainingStartInput = {
    workspaceId: 'ws_training-test',
    bundleRelativePath: 'bundle',
    outputRelativePath: 'adapter-output',
    pythonRuntime: 'python',
    mode: 'TRAIN',
  };
  const scope = buildDesktopTrainingScopePath(input);
  check(scope.includes('bundle=bundle') && scope.includes('output=adapter-output') && scope.includes('mode=TRAIN'), 'Training authorization scope binds run mode plus bundle and output identities');

  const mismatchedScope = await gateway.execute('service.desktop.training.start', input, {
    taskId: 'training_scope_mismatch',
    mode: 'SETTINGS',
    requestedBy: 'USER',
    resourceId: input.workspaceId,
    path: `${scope}-tampered`,
  });
  check(!mismatchedScope.success && mismatchedScope.error?.includes('approved capability scope') === true && starts === 0, 'Training bundle/output scope mismatch is blocked before L4 permission or IPC execution');

  const status = await getGovernedDesktopTrainingJob(job().id, bridge);
  check(status.state === 'RUNNING', 'Read-only job status recovery validates a bounded desktop snapshot without consuming an L4 execution grant');

  const history = await listGovernedDesktopTrainingJobs(bridge);
  check(history.length === 2 && history[1].state === 'SUCCEEDED', 'Bounded job history supports Settings recovery after navigation/remount');

  const cancelled = await cancelGovernedDesktopTrainingJob(job().id, bridge);
  check(cancelled.state === 'CANCELLED', 'Cancellation remains an immediately available safety control rather than a second execution authorization');

  let malformedBlocked = false;
  const malformedBridge: DesktopTrainingBridge = {
    ...bridge,
    getTrainingJob: async () => ({ success: true, job: { ...job(), stdoutTail: 'x'.repeat(70 * 1024) } }),
  };
  try { await getGovernedDesktopTrainingJob(job().id, malformedBridge); } catch { malformedBlocked = true; }
  check(malformedBlocked, 'Renderer rejects oversized/unbounded job snapshots returned by IPC');

  return { passed, total };
}
