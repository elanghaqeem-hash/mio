import type { AdapterIntegrityHashOutput } from '../platform/desktop/DesktopAdapterIntegrityGateway';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { buildTrainingBundle, type MioTrainingRunConfig } from '../training/TrainingBundle';
import type { MioTrainingExample } from '../training/TrainingDataset';
import type { MioTrainingResultArtifact } from '../training/TrainingCandidateRegistry';
import { TrainingCandidateRegistry } from '../training/TrainingCandidateRegistry';
import {
  type CandidateIntegrityDesktopPort,
  TrainingCandidateIntegrityService,
} from '../training/TrainingCandidateIntegrityService';
import { TrainingCandidateReviewService } from '../training/TrainingCandidateReviewService';
import { TrainingArtifactBindingService } from '../training/TrainingArtifactBindingService';
import { buildTrainingRunHandoff } from '../training/TrainingRunHandoff';
import { TrainingRunHandoffService } from '../training/TrainingRunHandoffService';

interface SuiteResult { passed: number; total: number; }

function hashOutput(fingerprint: string): AdapterIntegrityHashOutput {
  return {
    schemaVersion: 1,
    algorithm: 'SHA-256',
    canonicalization: 'mio-adapter-tree-v1',
    rootRelativePath: '.',
    fingerprint,
    fileCount: 4,
    totalBytes: 4096,
    limits: { maxFiles: 5000, maxBytes: 4 * 1024 * 1024 * 1024, maxDepth: 24 },
  };
}

async function rejects(action: () => Promise<unknown>, includes: string): Promise<boolean> {
  try {
    await action();
    return false;
  } catch (error) {
    return error instanceof Error && error.message.toLowerCase().includes(includes.toLowerCase());
  }
}

export async function runTrainingArtifactBindingTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`TrainingArtifactBinding test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const example: MioTrainingExample = {
    schemaVersion: 1,
    id: 'binding:001',
    domain: 'GENERAL',
    language: 'id',
    messages: [
      { role: 'user', content: 'Apa bukti artefak training yang sedang diuji?' },
      { role: 'assistant', content: 'Handoff training harus diikat ke fingerprint adapter yang dipindai.' },
    ],
    provenance: { kind: 'CURATED', createdAt: 1, reviewer: 'binding-test' },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  };
  const config: MioTrainingRunConfig = {
    baseModel: 'Qwen/Qwen3-8B',
    targetModel: 'Mio-Local-8B-binding-test',
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
  const bundle = await buildTrainingBundle([example], config, { generatedAt: 1_000 });
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
    trainedAt: new Date(2_000).toISOString(),
    exampleCount: 1,
    nextRequiredGate: 'MioBench + ModelPromotionGate',
  };
  const handoff = await buildTrainingRunHandoff(bundle, result, 3_000);
  const handoffJson = JSON.stringify(handoff);

  const storage = new InMemoryStorageProvider();
  const handoffs = new TrainingRunHandoffService(storage);
  const registration = await handoffs.register({
    handoffJson,
    runtimeModel: 'mio-binding-test:latest',
    artifactUri: 'local-model://mio-binding-test/latest',
    displayName: 'Mio Binding Test Candidate',
  });
  check(registration.receipt.handoffSha256 === handoff.handoffSha256, 'Handoff registration persists the exact verified handoff SHA-256 receipt');
  check(registration.receipt.trainingResultSha256 === registration.candidate.trainingResultSha256, 'Handoff receipt is bound to the exact candidate training-result identity');

  const repeated = await handoffs.register({
    handoffJson,
    runtimeModel: 'mio-binding-test:latest',
    artifactUri: 'local-model://mio-binding-test/latest',
    displayName: 'Mio Binding Test Candidate',
  });
  check(repeated.receipt.registeredAt === registration.receipt.registeredAt, 'Repeated identical handoff registration returns the immutable persisted receipt');

  const baselineFingerprint = 'a'.repeat(64);
  const driftFingerprint = 'b'.repeat(64);
  const fingerprints = [baselineFingerprint, baselineFingerprint, driftFingerprint];
  let revoked = 0;
  const fakePort: CandidateIntegrityDesktopPort = {
    authorizeDirectory: async () => ({ id: 'ws_binding_test', name: 'binding-adapter' }),
    hashDirectory: async () => hashOutput(fingerprints.shift() ?? driftFingerprint),
    revokeDirectory: async () => { revoked += 1; },
  };
  const integrity = new TrainingCandidateIntegrityService(storage);
  const bindingService = new TrainingArtifactBindingService(storage);

  const baseline = await integrity.scanCandidate(registration.candidate.id, fakePort);
  check(baseline.evidence?.comparison === 'BASELINE_CAPTURED', 'First adapter scan establishes TP-0.50 baseline before handoff binding');

  const beforeBinding = await bindingService.inspect(registration.candidate.id);
  check(beforeBinding.bindable && !beforeBinding.bindingValid && !beforeBinding.latestBinding, 'Verified handoff + clean integrity scan is bindable but not implicitly bound');

  const reviewBeforeBinding = await new TrainingCandidateReviewService(storage).inspect(registration.candidate.id);
  check(
    reviewBeforeBinding?.blockingReasons.some((reason) => reason.includes('Training handoff artifact binding: Current handoff-to-adapter binding is unavailable')) === true,
    'TP-0.58 candidate release review fails closed until current adapter scan is explicitly bound',
  );

  const firstBinding = await bindingService.bind(registration.candidate.id);
  check(firstBinding.handoffSha256 === handoff.handoffSha256 && firstBinding.integrityEvidenceId === baseline.evidence?.id, 'Binding links the exact handoff digest to the exact adapter integrity evidence id');
  check(firstBinding.adapterFingerprint === baselineFingerprint && firstBinding.trainingResultSha256 === registration.candidate.trainingResultSha256, 'Binding links adapter fingerprint and candidate training-result identity');
  const firstVerification = await bindingService.verifyLatest(registration.candidate.id);
  check(firstVerification.valid && firstVerification.binding?.bindingSha256 === firstBinding.bindingSha256, 'Fresh training handoff-to-adapter binding self-verifies');

  const tampered = { ...firstBinding, adapterFingerprint: 'c'.repeat(64) };
  await storage.set('training', firstBinding.id, tampered);
  const tamperedVerification = await bindingService.verifyLatest(registration.candidate.id);
  check(!tamperedVerification.valid && tamperedVerification.errors.some((error) => error.includes('digest mismatch')), 'Stored binding body tampering is detected by binding SHA-256');
  await storage.set('training', firstBinding.id, firstBinding);

  const matchingRescan = await integrity.scanCandidate(registration.candidate.id, fakePort);
  check(matchingRescan.evidence?.comparison === 'MATCH' && matchingRescan.evidence.id !== firstBinding.integrityEvidenceId, 'Unchanged adapter bytes produce a new MATCH scan evidence id');
  const historicalVerification = await bindingService.verifyEvidence(firstBinding.id);
  check(historicalVerification.valid && historicalVerification.integrity?.id === firstBinding.integrityEvidenceId, 'Promotion-time binding remains independently verifiable against its referenced historical integrity scan');
  const staleVerification = await bindingService.verifyLatest(registration.candidate.id);
  check(!staleVerification.valid && staleVerification.errors.some((error) => error.includes('stale relative to the supplied adapter integrity evidence')), 'Any newer adapter scan makes the current-review binding stale');

  const secondBinding = await bindingService.bind(registration.candidate.id);
  check(secondBinding.id !== firstBinding.id && secondBinding.integrityEvidenceId === matchingRescan.evidence?.id, 'Explicit re-bind creates evidence against the latest MATCH scan');
  check((await bindingService.verifyLatest(registration.candidate.id)).valid, 'Re-bound evidence is current after the matching re-scan');

  const drift = await integrity.scanCandidate(registration.candidate.id, fakePort);
  check(drift.evidence?.comparison === 'DRIFT', 'Changed adapter bytes remain DRIFT against the immutable baseline');
  check(!(await bindingService.verifyLatest(registration.candidate.id)).valid, 'Adapter DRIFT invalidates the previously current handoff binding');
  check(await rejects(() => bindingService.bind(registration.candidate.id), 'drift'), 'DRIFT blocks creation of replacement handoff-to-adapter binding');

  const driftReview = await new TrainingCandidateReviewService(storage).inspect(registration.candidate.id);
  check(
    driftReview?.blockingReasons.some((reason) => reason.includes('Training handoff artifact binding:')) === true,
    'Release review surfaces handoff binding failure after adapter drift',
  );
  check(revoked === 3, 'One-shot workspace authority is revoked after every scan used by binding tests');

  const legacyStorage = new InMemoryStorageProvider();
  const legacy = await new TrainingCandidateRegistry(legacyStorage).register({
    bundle: bundle.manifest,
    result,
    runtimeModel: 'mio-binding-legacy:latest',
    artifactUri: 'local-model://mio-binding-legacy/latest',
  });
  const legacyReview = await new TrainingCandidateReviewService(legacyStorage).inspect(legacy.candidate.id);
  check(
    legacyReview?.blockingReasons.some((reason) => reason.startsWith('Training handoff artifact binding:')) === false,
    'Legacy/non-handoff candidate remains backward-compatible and is not forced through TP-0.59 binding',
  );

  return { passed, total };
}
