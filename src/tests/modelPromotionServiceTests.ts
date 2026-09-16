import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { ModelProvider } from '../types/models';
import type { AdapterIntegrityHashOutput } from '../platform/desktop/DesktopAdapterIntegrityGateway';
import { ModelManifestRepository } from '../training/ModelManifestRepository';
import { ModelPromotionService } from '../training/ModelPromotionService';
import type { MioBenchCase } from '../training/MioBench';
import { buildTrainingBundle, type MioTrainingRunConfig } from '../training/TrainingBundle';
import { TrainingCandidateRegistry, type MioTrainingResultArtifact } from '../training/TrainingCandidateRegistry';
import { TrainingCandidateReviewService } from '../training/TrainingCandidateReviewService';
import {
  type CandidateIntegrityDesktopPort,
  TrainingCandidateIntegrityService,
} from '../training/TrainingCandidateIntegrityService';
import type { MioTrainingExample } from '../training/TrainingDataset';

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

export async function runModelPromotionServiceTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`ModelPromotionService test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const storage = new InMemoryStorageProvider();
  const registry = new TrainingCandidateRegistry(storage);
  const reviewService = new TrainingCandidateReviewService(storage);
  const integrityService = new TrainingCandidateIntegrityService(storage);
  const promotionService = new ModelPromotionService(storage);
  const manifests = new ModelManifestRepository(storage);

  const example: MioTrainingExample = {
    schemaVersion: 1,
    id: 'seed:promotion-001',
    domain: 'GENERAL',
    language: 'id',
    messages: [
      { role: 'user', content: 'Apa prinsip final promotion Mio?' },
      { role: 'assistant', content: 'Final promotion membutuhkan governance, security, benchmark, integrity, dan persetujuan eksplisit.' },
    ],
    provenance: { kind: 'CURATED', createdAt: 10, reviewer: 'promotion-dataset-reviewer' },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  };
  const config: MioTrainingRunConfig = {
    baseModel: 'Qwen/Qwen3-8B',
    targetModel: 'Mio-Local-8B-promotion-candidate',
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
  const bundle = await buildTrainingBundle([example], config, { generatedAt: 1000 });
  const trainingResult: MioTrainingResultArtifact = {
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
  const registered = await registry.register({
    bundle: bundle.manifest,
    result: trainingResult,
    runtimeModel: 'mio-promotion:latest',
    artifactUri: 'local-model://mio-promotion/latest',
    displayName: 'Mio Promotion Candidate',
    benchmarkPolicy: { minPassRate: 1, minScoreRatio: 1, requiredDomains: ['GENERAL'] },
  });

  const caseDefinition: MioBenchCase = {
    id: 'promotion-general',
    domain: 'GENERAL',
    prompt: 'Apa prinsip promotion?',
    requiredPhrases: ['governance'],
  };
  const provider: ModelProvider = {
    id: 'local_heuristic',
    displayName: 'Promotion Test Provider',
    requiresNetwork: false,
    requiresProxy: false,
    async generate() {
      return {
        provider: 'local_heuristic',
        model: 'mio-promotion:latest',
        text: 'Promotion Mio membutuhkan governance sebagai kontrol wajib.',
        generatedAt: Date.now(),
        source: 'LOCAL',
      };
    },
  };
  await registry.evaluate(registered.candidate.id, provider, [caseDefinition]);
  await reviewService.advanceToReleaseCandidate({
    candidateId: registered.candidate.id,
    reviewer: 'rc-reviewer',
    dataGovernanceAttested: true,
    securityAttested: true,
  });

  const noIntegrity = await promotionService.inspect(registered.manifest.id);
  check(
    noIntegrity?.promotionEligible === false
      && noIntegrity.blockingReasons.includes('Adapter byte-integrity evidence is required before promotion'),
    'Adapter-based release candidate cannot be promoted without byte-integrity evidence',
  );

  const baselineFingerprint = 'a'.repeat(64);
  const driftFingerprint = 'b'.repeat(64);
  const fingerprints = [baselineFingerprint, driftFingerprint, baselineFingerprint];
  const fakePort: CandidateIntegrityDesktopPort = {
    authorizeDirectory: async () => ({ id: 'ws_promotion', name: 'promotion-adapter' }),
    hashDirectory: async () => hashOutput(fingerprints.shift() ?? baselineFingerprint),
    revokeDirectory: async () => undefined,
  };

  const baseline = await integrityService.scanCandidate(registered.candidate.id, fakePort);
  check(baseline.evidence?.comparison === 'BASELINE_CAPTURED', 'Explicit desktop scan establishes candidate promotion integrity baseline');
  const baselineReady = await promotionService.inspect(registered.manifest.id);
  check(baselineReady?.promotionEligible === true, 'RC with benchmark, reviews, and bound integrity baseline is eligible for explicit promotion');

  await integrityService.scanCandidate(registered.candidate.id, fakePort);
  const driftBlocked = await promotionService.inspect(registered.manifest.id);
  check(
    driftBlocked?.promotionEligible === false
      && driftBlocked.blockingReasons.some((reason) => reason.includes('DRIFT')),
    'Adapter drift blocks final model promotion',
  );

  await integrityService.scanCandidate(registered.candidate.id, fakePort);
  const restored = await promotionService.inspect(registered.manifest.id);
  check(restored?.promotionEligible === true, 'Restoring adapter bytes to immutable baseline clears the promotion integrity blocker');

  let attestationBlocked = false;
  try {
    await promotionService.promote({
      manifestId: registered.manifest.id,
      promoter: 'final-promoter',
      finalAttestation: false,
    });
  } catch (error) {
    attestationBlocked = error instanceof Error && error.message.includes('Final promotion attestation');
  }
  check(attestationBlocked, 'Promotion requires an explicit final human attestation');

  const promoted = await promotionService.promote({
    manifestId: registered.manifest.id,
    promoter: 'final-promoter',
    finalAttestation: true,
  });
  check(promoted.manifest.lifecycle === 'PROMOTED', 'Eligible release candidate advances to PROMOTED only after explicit final action');
  check(promoted.manifest.review.reviewer === 'final-promoter', 'Promotion records the final named promoter');
  check(Boolean(promoted.integrityEvidenceId), 'Promotion result binds the integrity evidence used at promotion time');
  check((await manifests.getActivePromoted()) === undefined, 'Promotion never auto-activates the model runtime');

  const persisted = await manifests.get(registered.manifest.id);
  check(persisted?.lifecycle === 'PROMOTED', 'PROMOTED lifecycle persists in the model manifest registry');

  let replayBlocked = false;
  try {
    await promotionService.promote({
      manifestId: registered.manifest.id,
      promoter: 'second-promoter',
      finalAttestation: true,
    });
  } catch (error) {
    replayBlocked = error instanceof Error && error.message.includes('already PROMOTED');
  }
  check(replayBlocked, 'Promotion cannot be replayed to overwrite final promotion review implicitly');

  return { passed, total };
}
