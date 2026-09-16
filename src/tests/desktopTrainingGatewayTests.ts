import { eventBus } from '../core/EventBus';
import { PermissionEngine } from '../security/PermissionEngine';
import { createDefaultCapabilityRegistry } from '../security/CapabilityRegistry';
import type { DryRunRequest } from '../types/security';
import {
  buildDesktopTrainingHandoffScopePath,
  buildDesktopTrainingScopePath,
  cancelGovernedDesktopTrainingJob,
  createDesktopTrainingGateway,
  expectedDesktopTrainingHandoffRelativePath,
  getGovernedDesktopTrainingHandoffReceipt,
  getGovernedDesktopTrainingJob,
  listGovernedDesktopTrainingJobs,
  packageGovernedDesktopTrainingHandoff,
  type DesktopTrainingBridge,
  type DesktopTrainingHandoffPackageReceipt,
  type DesktopTrainingJobMode,
  type DesktopTrainingJobSnapshot,
  type DesktopTrainingStartInput,
} from '../platform/desktop/DesktopTrainingGateway';

interface SuiteResult { passed: number; total: number; }

const DATASET_SHA = 'a'.repeat(64);
const CONFIG_SHA = 'b'.repeat(64);
const BUNDLE_ID = `mio-train-${DATASET_SHA.slice(0, 12)}-${CONFIG_SHA.slice(0, 12)}`;

function job(state: DesktopTrainingJobSnapshot['state'] = 'RUNNING', mode: DesktopTrainingJobMode = 'DRY_RUN'): DesktopTrainingJobSnapshot {
  return {
    schemaVersion: 1,
    id: 'training-job:1000:123e4567-e89b-12d3-a456-426614174000',
    state,
    mode,
    pythonRuntime: 'python',
    workspaceId: 'ws_training-test',
    bundleRelativePath: 'bundle',
    ...(mode === 'TRAIN' ? { outputRelativePath: 'adapter-output', resultFileRelativePath: 'adapter-output/mio-training-result.json' } : {}),
    trainingIdentity: { bundleId: BUNDLE_ID, datasetSha256: DATASET_SHA, configSha256: CONFIG_SHA },
    startedAt: 1_000,
    stdoutTail: 'MIO TRAINING BUNDLE: VERIFIED',
    stderrTail: '',
    disclosure: 'Governed local runner test snapshot.',
  };
}

function receipt(): DesktopTrainingHandoffPackageReceipt {
  return {
    schemaVersion: 1,
    kind: 'MIO_TRAINING_HANDOFF_PACKAGE_RECEIPT_V1',
    trainingJobId: job().id,
    workspaceId: 'ws_training-test',
    bundleRelativePath: 'bundle',
    resultFileRelativePath: 'adapter-output/mio-training-result.json',
    handoffRelativePath: 'adapter-output/mio-training-handoff.json',
    bundleId: BUNDLE_ID,
    datasetSha256: DATASET_SHA,
    configSha256: CONFIG_SHA,
    handoffSha256: 'c'.repeat(64),
    packagedAt: 2_000,
    disclosure: 'Governed TP-0.63 test receipt.',
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

  PermissionEngine.clearForTests();
  const defaultRegistry = createDefaultCapabilityRegistry();
  check(defaultRegistry.get('service.desktop.training.start')?.availability === 'UNAVAILABLE', 'Training execution capability is fail-closed outside the desktop runtime');
  check(defaultRegistry.get('service.desktop.training.package-handoff')?.availability === 'UNAVAILABLE', 'Handoff packaging capability is fail-closed outside the desktop runtime');

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
  const handoffDescriptor = desktopRegistry.get('service.desktop.training.package-handoff');
  check(
    handoffDescriptor?.availability === 'AVAILABLE'
      && handoffDescriptor.permissionLevel === 'L4_EXECUTE'
      && handoffDescriptor.networkAccess === false,
    'TP-0.63 handoff creation is separately L4-gated and declares no network access',
  );

  let starts = 0;
  let packages = 0;
  const bridge: DesktopTrainingBridge = {
    startTrainingJob: async () => { starts += 1; return { success: true, job: job() }; },
    getTrainingJob: async () => ({ success: true, job: job() }),
    listTrainingJobs: async () => ({ success: true, jobs: [job(), job('SUCCEEDED', 'TRAIN')] }),
    cancelTrainingJob: async () => ({ success: true, job: job('CANCELLED') }),
    packageTrainingHandoff: async () => { packages += 1; return { success: true, receipt: receipt() }; },
    getTrainingHandoffReceipt: async () => ({ success: true, receipt: receipt() }),
  };
  const gateway = createDesktopTrainingGateway(bridge);
  check(gateway.has('service.desktop.training.start') && gateway.has('service.desktop.training.package-handoff'), 'Fixed training and handoff entrypoints register only through SecureServiceGateway');

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

  const successfulTrain = job('SUCCEEDED', 'TRAIN');
  check(expectedDesktopTrainingHandoffRelativePath(successfulTrain) === 'adapter-output/mio-training-handoff.json', 'TP-0.63 output filename is fixed beside the TP-0.62 result');
  const handoffInput = {
    jobId: successfulTrain.id,
    workspaceId: successfulTrain.workspaceId,
    bundleRelativePath: successfulTrain.bundleRelativePath,
    resultFileRelativePath: successfulTrain.resultFileRelativePath!,
    handoffRelativePath: expectedDesktopTrainingHandoffRelativePath(successfulTrain),
  };
  const handoffScope = buildDesktopTrainingHandoffScopePath(handoffInput);
  const badHandoffScope = await gateway.execute('service.desktop.training.package-handoff', handoffInput, {
    taskId: 'handoff_scope_mismatch', mode: 'SETTINGS', requestedBy: 'USER', resourceId: handoffInput.workspaceId, path: `${handoffScope}-tampered`,
  });
  check(!badHandoffScope.success && badHandoffScope.error?.includes('approved capability scope') === true && packages === 0, 'TP-0.63 path-scope mismatch is blocked before permission or IPC packaging');

  const approvals: DryRunRequest[] = [];
  const stopApprove = eventBus.on<DryRunRequest>('REQUEST_DRY_RUN_PERMISSION', (request) => {
    approvals.push(request);
    request.onApprove();
  });
  const packaged = await packageGovernedDesktopTrainingHandoff(successfulTrain, 'handoff_approved_task', bridge);
  stopApprove();
  check(packaged.handoffSha256 === 'c'.repeat(64) && packages === 1 && approvals.length === 1, 'Explicit L4 approval creates one bounded TP-0.63 receipt through the fixed packaging bridge');
  check(packaged.bundleId === successfulTrain.trainingIdentity.bundleId && packaged.datasetSha256 === successfulTrain.trainingIdentity.datasetSha256, 'TP-0.63 receipt remains bound to the immutable pre-training bundle identity');

  const recoveredReceipt = await getGovernedDesktopTrainingHandoffReceipt(successfulTrain.id, bridge);
  check(recoveredReceipt?.handoffRelativePath === 'adapter-output/mio-training-handoff.json', 'Read-only packaging receipt can be recovered without another execution grant');

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

  PermissionEngine.clearForTests();
  return { passed, total };
}
