import { createDefaultCapabilityRegistry } from '../security/CapabilityRegistry';
import {
  buildDesktopTrainingHandoffReadScopePath,
  createDesktopTrainingHandoffIngestionGateway,
  readGovernedDesktopTrainingHandoff,
  type DesktopTrainingHandoffReadBridge,
  type DesktopTrainingHandoffReadInput,
} from '../platform/desktop/DesktopTrainingHandoffIngestionGateway';
import type { DesktopTrainingHandoffPackageReceipt } from '../platform/desktop/DesktopTrainingGateway';

interface SuiteResult { passed: number; total: number; }

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const SHA_D = 'd'.repeat(64);

function receipt(): DesktopTrainingHandoffPackageReceipt {
  return {
    schemaVersion: 1,
    kind: 'MIO_TRAINING_HANDOFF_PACKAGE_RECEIPT_V1',
    trainingJobId: 'training-job:1000:123e4567-e89b-12d3-a456-426614174000',
    workspaceId: 'ws_original-training',
    bundleRelativePath: 'bundle',
    resultFileRelativePath: 'adapter-output/mio-training-result.json',
    handoffRelativePath: 'adapter-output/mio-training-handoff.json',
    bundleId: 'mio-train-aaaaaaaaaaaa-bbbbbbbbbbbb',
    datasetSha256: SHA_A,
    configSha256: SHA_B,
    handoffSha256: SHA_C,
    packagedAt: 2_000,
    disclosure: 'TP-0.63 test receipt.',
  };
}

function bridgeResult(readWorkspaceId = 'ws_reauthorized'): Awaited<ReturnType<DesktopTrainingHandoffReadBridge['readTrainingHandoff']>> {
  const source = receipt();
  return {
    success: true,
    result: {
      schemaVersion: 1,
      kind: 'MIO_TRAINING_HANDOFF_READ_RESULT_V1',
      trainingJobId: source.trainingJobId,
      readWorkspaceId,
      handoffRelativePath: source.handoffRelativePath,
      handoffSha256: source.handoffSha256,
      bytes: 1024,
      handoffJson: JSON.stringify({ schemaVersion: 1, kind: 'MIO_TRAINING_RUN_HANDOFF_V1', handoffSha256: source.handoffSha256 }),
      receipt: source,
      disclosure: 'Bounded fixed-path read for test.',
    },
  };
}

export async function runDesktopTrainingHandoffIngestionTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`DesktopTrainingHandoffIngestion test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const defaultRegistry = createDefaultCapabilityRegistry();
  check(defaultRegistry.get('service.desktop.training.read-handoff')?.availability === 'UNAVAILABLE', 'Desktop handoff ingestion fails closed outside Electron');

  const desktopRegistry = createDefaultCapabilityRegistry({ desktopTrainingBridge: true });
  const descriptor = desktopRegistry.get('service.desktop.training.read-handoff');
  check(
    descriptor?.availability === 'AVAILABLE'
      && descriptor.permissionLevel === 'L0_OBSERVE'
      && descriptor.riskLevel === 'HIGH'
      && descriptor.networkAccess === false
      && descriptor.modes.length === 1
      && descriptor.modes[0] === 'SETTINGS',
    'Fixed handoff read is SETTINGS-only, high-sensitivity, L0 observe, and network-free',
  );

  let reads = 0;
  const bridge: DesktopTrainingHandoffReadBridge = {
    readTrainingHandoff: async ({ workspaceId }) => {
      reads += 1;
      return bridgeResult(workspaceId);
    },
  };
  const gateway = createDesktopTrainingHandoffIngestionGateway(bridge);
  check(gateway.has('service.desktop.training.read-handoff'), 'Handoff read registers only through SecureServiceGateway');

  const source = receipt();
  const input: DesktopTrainingHandoffReadInput = {
    jobId: source.trainingJobId,
    workspaceId: 'ws_reauthorized',
    handoffRelativePath: source.handoffRelativePath,
    handoffSha256: source.handoffSha256,
  };
  const scope = buildDesktopTrainingHandoffReadScopePath(input);
  check(scope.includes(source.trainingJobId) && scope.includes(source.handoffRelativePath) && scope.includes(source.handoffSha256), 'Read authorization scope binds job, fixed handoff path, and receipt SHA-256');

  const mismatch = await gateway.execute('service.desktop.training.read-handoff', input, {
    taskId: 'tp064_scope_mismatch',
    mode: 'SETTINGS',
    requestedBy: 'USER',
    resourceId: input.workspaceId,
    path: `${scope}-tampered`,
  });
  check(!mismatch.success && mismatch.error?.includes('approved capability scope') === true && reads === 0, 'Scope mismatch is blocked before IPC read execution');

  const result = await readGovernedDesktopTrainingHandoff(source, 'ws_reauthorized', 'tp064_valid_read', bridge);
  check(result.trainingJobId === source.trainingJobId && result.readWorkspaceId === 'ws_reauthorized' && result.handoffSha256 === source.handoffSha256 && reads === 1, 'Valid receipt-bound handoff is read from an explicitly re-authorized workspace');

  let tamperedReceiptBlocked = false;
  try { await readGovernedDesktopTrainingHandoff({ ...source, handoffSha256: SHA_D }, 'ws_reauthorized', 'tp064_bad_receipt', bridge); }
  catch { tamperedReceiptBlocked = true; }
  check(tamperedReceiptBlocked, 'Renderer rejects handoff read output that does not match the supplied TP-0.63 receipt identity');

  let oversizedBlocked = false;
  const oversizedBridge: DesktopTrainingHandoffReadBridge = {
    readTrainingHandoff: async () => ({
      ...bridgeResult('ws_reauthorized'),
      result: {
        ...bridgeResult('ws_reauthorized').result!,
        bytes: 64 * 1024 * 1024 + 1,
      },
    }),
  };
  try { await readGovernedDesktopTrainingHandoff(source, 'ws_reauthorized', 'tp064_oversized', oversizedBridge); }
  catch { oversizedBlocked = true; }
  check(oversizedBlocked, 'Oversized handoff read result is rejected by the renderer output contract');

  return { passed, total };
}
