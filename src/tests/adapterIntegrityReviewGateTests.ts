import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { ModelProvider } from '../types/models';
import type { AdapterIntegrityHashOutput } from '../platform/desktop/DesktopAdapterIntegrityGateway';
import { buildTrainingBundle, type MioTrainingRunConfig } from '../training/TrainingBundle';
import type { MioTrainingExample } from '../training/TrainingDataset';
import type { MioBenchCase } from '../training/MioBench';
import { TrainingCandidateRegistry, type MioTrainingResultArtifact } from '../training/TrainingCandidateRegistry';
import {
  TrainingCandidateIntegrityService,
  type CandidateIntegrityDesktopPort,
} from '../training/TrainingCandidateIntegrityService';
import { TrainingCandidateReviewService } from '../training/TrainingCandidateReviewService';

interface SuiteResult { passed: number; total: number; }

const example: MioTrainingExample = {
  schemaVersion: 1,
  id: 'integrity-review:001',
  domain: 'GENERAL',
  language: 'id',
  messages: [
    { role: 'user', content: 'Apa fungsi integrity gate?' },
    { role: 'assistant', content: 'Integrity gate memeriksa bukti byte sebelum review model.' },
  ],
  provenance: { kind: 'CURATED', createdAt: 1, reviewer: 'integrity-review-test' },
  eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
  quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
};

const config: MioTrainingRunConfig = {
  baseModel: 'Qwen/Qwen3-8B',
  targetModel: 'Mio-Local-8B-integrity-review',
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
    fileCount: 2,
    totalBytes: 512,
    limits: { maxFiles: 5000, maxBytes: 4 * 1024 * 1024 * 1024, maxDepth: 24 },
  };
}

export async function runAdapterIntegrityReviewGateTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`AdapterIntegrityReviewGate test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const storage = new InMemoryStorageProvider();
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

  const registry = new TrainingCandidateRegistry(storage);
  const registration = await registry.register({
    bundle: bundle.manifest,
    result,
    runtimeModel: 'mio-integrity-review:latest',
    artifactUri: 'local-model://mio-integrity-review/latest',
    benchmarkPolicy: { minPassRate: 1, minScoreRatio: 1, requiredDomains: ['GENERAL'] },
  });

  const benchCase: MioBenchCase = {
    id: 'integrity-review-general',
    domain: 'GENERAL',
    prompt: 'Apa fungsi integrity gate?',
    requiredPhrases: ['integrity'],
  };
  const provider: ModelProvider = {
    id: 'local_heuristic',
    displayName: 'Integrity Review Test Provider',
    requiresNetwork: false,
    requiresProxy: false,
    async generate() {
      return {
        provider: 'local_heuristic',
        model: 'mio-integrity-review:latest',
        text: 'Integrity gate menjaga bukti model.',
        generatedAt: Date.now(),
        source: 'LOCAL',
      };
    },
  };
  await registry.evaluate(registration.candidate.id, provider, [benchCase]);

  const integrity = new TrainingCandidateIntegrityService(storage);
  const review = new TrainingCandidateReviewService(storage);
  const baselineFingerprint = 'a'.repeat(64);
  const driftFingerprint = 'b'.repeat(64);
  let currentFingerprint = baselineFingerprint;
  const port: CandidateIntegrityDesktopPort = {
    authorizeDirectory: async () => ({ id: 'ws_review_gate', name: 'adapter-review' }),
    hashDirectory: async () => hashOutput(currentFingerprint),
    revokeDirectory: async () => undefined,
  };

  const baseline = await integrity.scanCandidate(registration.candidate.id, port);
  check(baseline.evidence?.comparison === 'BASELINE_CAPTURED', 'First adapter scan captures a baseline before release review');
  const eligibleWithBaseline = await review.inspect(registration.candidate.id);
  check(eligibleWithBaseline?.releaseCandidateEligible === true, 'Non-drift integrity baseline does not block an otherwise eligible release review');

  currentFingerprint = driftFingerprint;
  const drift = await integrity.scanCandidate(registration.candidate.id, port);
  check(drift.evidence?.comparison === 'DRIFT', 'Changed adapter bytes produce DRIFT evidence');
  const blocked = await review.inspect(registration.candidate.id);
  check(
    blocked?.releaseCandidateEligible === false
      && blocked.blockingReasons.some((reason) => reason.includes('DRIFT')),
    'Latest DRIFT evidence blocks RELEASE_CANDIDATE eligibility',
  );

  let transitionBlocked = false;
  try {
    await review.advanceToReleaseCandidate({
      candidateId: registration.candidate.id,
      reviewer: 'integrity-reviewer',
      dataGovernanceAttested: true,
      securityAttested: true,
    });
  } catch (error) {
    transitionBlocked = error instanceof Error && error.message.includes('DRIFT');
  }
  check(transitionBlocked, 'Explicit release review cannot override unresolved adapter DRIFT');

  const countBeforeFailedRevocation = (await integrity.list(registration.candidate.id, 20)).length;
  const revocationFailurePort: CandidateIntegrityDesktopPort = {
    authorizeDirectory: async () => ({ id: 'ws_revoke_failure', name: 'adapter-review' }),
    hashDirectory: async () => hashOutput(baselineFingerprint),
    revokeDirectory: async () => { throw new Error('simulated revoke failure'); },
  };
  let revocationFailureRejected = false;
  try {
    await integrity.scanCandidate(registration.candidate.id, revocationFailurePort);
  } catch (error) {
    revocationFailureRejected = error instanceof Error && error.message.includes('revoke failure');
  }
  const countAfterFailedRevocation = (await integrity.list(registration.candidate.id, 20)).length;
  check(revocationFailureRejected, 'Workspace revocation failure makes the integrity scan fail closed');
  check(countAfterFailedRevocation === countBeforeFailedRevocation, 'No new integrity evidence is persisted when one-shot workspace revocation fails');

  return { passed, total };
}
