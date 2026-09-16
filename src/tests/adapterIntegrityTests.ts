import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceSandbox } from '../../electron/ipc/workspaceSandbox';
import {
  AdapterIntegrityHashOutput,
  createDesktopAdapterIntegrityGateway,
  type DesktopAdapterIntegrityBridge,
} from '../platform/desktop/DesktopAdapterIntegrityGateway';
import { createDefaultCapabilityRegistry, createDesktopCapabilityRegistry } from '../security/CapabilityRegistry';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { ModelManifestRepository } from '../training/ModelManifestRepository';
import { MioTrainingRunConfig, buildTrainingBundle } from '../training/TrainingBundle';
import { MioTrainingExample } from '../training/TrainingDataset';
import { MioTrainingResultArtifact, TrainingCandidateRegistry } from '../training/TrainingCandidateRegistry';
import {
  CandidateIntegrityDesktopPort,
  TrainingCandidateIntegrityService,
} from '../training/TrainingCandidateIntegrityService';

interface SuiteResult { passed: number; total: number; }

async function rejects(action: () => Promise<unknown>, includes?: string): Promise<boolean> {
  try {
    await action();
    return false;
  } catch (error) {
    if (!includes) return true;
    return error instanceof Error && error.message.toLowerCase().includes(includes.toLowerCase());
  }
}

const example: MioTrainingExample = {
  schemaVersion: 1,
  id: 'integrity:seed-001',
  domain: 'GENERAL',
  language: 'id',
  messages: [
    { role: 'user', content: 'Apa fungsi model router?' },
    { role: 'assistant', content: 'Model router memilih model sesuai tugas dan kebijakan.' },
  ],
  provenance: { kind: 'CURATED', createdAt: 1, reviewer: 'integrity-test' },
  eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
  quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
};

const config: MioTrainingRunConfig = {
  baseModel: 'Qwen/Qwen3-8B',
  targetModel: 'Mio-Local-8B-integrity',
  trainingMethod: 'QLORA',
  seed: 42,
  maxSequenceLength: 4096,
  learningRate: 0.0002,
  epochs: 1,
  perDeviceTrainBatchSize: 1,
  gradientAccumulationSteps: 8,
  assistantOnlyLoss: true,
  packing: false,
  lora: { rank: 16, alpha: 32, dropout: 0.05 },
  requiredDomains: ['GENERAL'],
  minExamples: 1,
};

function hashOutput(fingerprint: string): AdapterIntegrityHashOutput {
  return {
    schemaVersion: 1,
    algorithm: 'SHA-256',
    canonicalization: 'mio-adapter-tree-v1',
    rootRelativePath: '.',
    fingerprint,
    fileCount: 3,
    totalBytes: 1234,
    limits: { maxFiles: 5000, maxBytes: 4 * 1024 * 1024 * 1024, maxDepth: 24 },
  };
}

export async function runAdapterIntegrityTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`AdapterIntegrity test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const base = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mio-adapter-integrity-'));
  const root = path.join(base, 'adapter');
  const outside = path.join(base, 'outside');
  await fs.promises.mkdir(path.join(root, 'nested'), { recursive: true });
  await fs.promises.mkdir(outside, { recursive: true });
  await fs.promises.writeFile(path.join(root, 'adapter_config.json'), '{"r":16}', 'utf8');
  await fs.promises.writeFile(path.join(root, 'nested', 'adapter.bin'), Buffer.from([1, 2, 3, 4, 5]));
  await fs.promises.writeFile(path.join(outside, 'secret.bin'), Buffer.from([9, 9, 9]));

  try {
    const sandbox = new WorkspaceSandbox();
    const workspace = await sandbox.authorizeRoot(root);
    const first = await sandbox.hashTree(workspace.id, '.');
    const second = await sandbox.hashTree(workspace.id, '.');
    check(first.fingerprint === second.fingerprint && /^[a-f0-9]{64}$/.test(first.fingerprint), 'Adapter tree fingerprint is deterministic SHA-256 for unchanged bytes');
    check(first.fileCount === 2 && first.totalBytes > 0, 'Adapter tree fingerprint records bounded file-count and byte evidence');
    check(first.files.every((item) => !path.isAbsolute(item.relativePath) && !item.relativePath.includes('..')), 'Internal tree manifest exposes relative paths only');

    await fs.promises.writeFile(path.join(root, 'nested', 'adapter.bin'), Buffer.from([1, 2, 3, 4, 6]));
    const changed = await sandbox.hashTree(workspace.id, '.');
    check(changed.fingerprint !== first.fingerprint, 'Byte changes produce adapter fingerprint drift');

    await fs.promises.symlink(outside, path.join(root, 'escape-link'), 'dir');
    check(await rejects(() => sandbox.hashTree(workspace.id, '.'), 'symbolic links'), 'Adapter integrity scan rejects symlinks instead of following them');
    await fs.promises.rm(path.join(root, 'escape-link'), { force: true });

    const fileBounded = new WorkspaceSandbox(1024, 1000, 1, 1024 * 1024, 8);
    const fileBoundedWorkspace = await fileBounded.authorizeRoot(root);
    check(await rejects(() => fileBounded.hashTree(fileBoundedWorkspace.id, '.'), 'maximum file count'), 'Adapter integrity scan enforces maximum file count');

    const byteBounded = new WorkspaceSandbox(1024, 1000, 100, 4, 8);
    const byteBoundedWorkspace = await byteBounded.authorizeRoot(root);
    check(await rejects(() => byteBounded.hashTree(byteBoundedWorkspace.id, '.'), 'maximum hashed byte budget'), 'Adapter integrity scan enforces aggregate byte budget before hashing oversized content');

    const webDescriptor = createDefaultCapabilityRegistry().get('service.desktop.workspace.hash-tree');
    check(webDescriptor?.availability === 'UNAVAILABLE', 'Adapter integrity capability fails closed in the default web runtime');

    const desktopDescriptor = createDesktopCapabilityRegistry().get('service.desktop.workspace.hash-tree');
    check(
      desktopDescriptor?.availability === 'AVAILABLE'
        && desktopDescriptor.permissionLevel === 'L4_EXECUTE'
        && desktopDescriptor.riskLevel === 'HIGH'
        && desktopDescriptor.networkAccess === false
        && desktopDescriptor.modes.length === 1
        && desktopDescriptor.modes[0] === 'SETTINGS',
      'Desktop adapter integrity capability is L4, read-only/no-network, and Settings-scoped',
    );

    const bridge: DesktopAdapterIntegrityBridge = {
      hashWorkspaceTree: async () => ({ success: true, result: hashOutput('a'.repeat(64)) }),
    };
    const gateway = createDesktopAdapterIntegrityGateway(bridge);
    check(gateway.has('service.desktop.workspace.hash-tree'), 'Adapter hashing registers only through the secure service gateway');
    const mismatchedScope = await gateway.execute(
      'service.desktop.workspace.hash-tree',
      { workspaceId: 'ws_test', relativePath: '.' },
      { taskId: 'integrity_scope_mismatch', mode: 'SETTINGS', requestedBy: 'USER', resourceId: 'ws_other', path: '.' },
    );
    check(!mismatchedScope.success && mismatchedScope.error?.includes('approved capability scope') === true, 'Adapter hashing input must match approved workspace resource scope before permission execution');
  } finally {
    await fs.promises.rm(base, { recursive: true, force: true });
  }

  const storage = new InMemoryStorageProvider();
  const bundle = await buildTrainingBundle([example], config, { generatedAt: 1000 });
  const result: MioTrainingResultArtifact = {
    schemaVersion: 1,
    status: 'TRAINED_NOT_EVALUATED',
    promotionStatus: 'NOT_EVALUATED',
    bundleId: bundle.manifest.bundleId,
    datasetSha256: bundle.manifest.dataset.sha256,
    configSha256: bundle.manifest.reproducibility.configSha256,
    baseModel: config.baseModel,
    targetModel: config.targetModel,
    trainingMethod: config.trainingMethod,
    trainedAt: new Date(2000).toISOString(),
    exampleCount: 1,
    nextRequiredGate: 'MioBench + ModelPromotionGate',
  };
  const registry = new TrainingCandidateRegistry(storage);
  const registration = await registry.register({
    bundle: bundle.manifest,
    result,
    runtimeModel: 'mio-integrity:latest',
    artifactUri: 'local-model://mio-integrity/latest',
    displayName: 'Mio Integrity Candidate',
  });

  const fingerprints = ['b'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
  let revoked = 0;
  const fakePort: CandidateIntegrityDesktopPort = {
    authorizeDirectory: async () => ({ id: 'ws_integrity', name: 'adapter-local' }),
    hashDirectory: async () => hashOutput(fingerprints.shift() ?? 'd'.repeat(64)),
    revokeDirectory: async () => { revoked += 1; },
  };
  const integrity = new TrainingCandidateIntegrityService(storage);
  const baseline = await integrity.scanCandidate(registration.candidate.id, fakePort);
  check(baseline.evidence?.comparison === 'BASELINE_CAPTURED', 'First authorized adapter scan captures a byte-level baseline without lifecycle mutation');
  const match = await integrity.scanCandidate(registration.candidate.id, fakePort);
  check(match.evidence?.comparison === 'MATCH' && match.evidence.previousFingerprint === baseline.evidence?.fingerprint, 'Repeated identical adapter scan is recorded as MATCH against previous evidence');
  const drift = await integrity.scanCandidate(registration.candidate.id, fakePort);
  check(drift.evidence?.comparison === 'DRIFT' && drift.evidence.previousFingerprint === match.evidence?.fingerprint, 'Changed adapter fingerprint is recorded explicitly as DRIFT');
  check(revoked === 3, 'Workspace authority is revoked after every completed adapter integrity scan');
  const history = await integrity.list(registration.candidate.id, 10);
  check(history.length === 3 && history[0].comparison === 'DRIFT', 'Adapter integrity evidence persists newest-first without file-name disclosure');
  const candidateManifest = await new ModelManifestRepository(storage).get(registration.candidate.manifestId);
  check(candidateManifest?.lifecycle === 'EXPERIMENTAL', 'Adapter integrity evidence never auto-advances model lifecycle');
  check((await new ModelManifestRepository(storage).getActivePromoted()) === undefined, 'Adapter integrity evidence never activates a model');

  let cancelledRevoked = 0;
  const cancelledPort: CandidateIntegrityDesktopPort = {
    authorizeDirectory: async () => null,
    hashDirectory: async () => hashOutput('e'.repeat(64)),
    revokeDirectory: async () => { cancelledRevoked += 1; },
  };
  const cancelled = await integrity.scanCandidate(registration.candidate.id, cancelledPort);
  check(cancelled.cancelled && cancelledRevoked === 0 && (await integrity.list(registration.candidate.id, 10)).length === 3, 'Cancelled directory picker creates no integrity evidence or fake revocation event');

  return { passed, total };
}
