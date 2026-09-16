import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { ModelProvider } from '../types/models';
import { MioBenchCase } from '../training/MioBench';
import { ModelManifestRepository } from '../training/ModelManifestRepository';
import { buildTrainingBundle, MioTrainingRunConfig } from '../training/TrainingBundle';
import { TrainingCandidateRegistry, MioTrainingResultArtifact } from '../training/TrainingCandidateRegistry';
import { TrainingCandidateReviewService } from '../training/TrainingCandidateReviewService';
import { MioTrainingExample } from '../training/TrainingDataset';

export async function runTrainingCandidateReviewTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ [PASS] ${name}`);
    } else {
      console.error(`✗ [FAIL] ${name}`);
    }
  };

  const storage = new InMemoryStorageProvider();
  const registry = new TrainingCandidateRegistry(storage);
  const reviewService = new TrainingCandidateReviewService(storage);
  const manifests = new ModelManifestRepository(storage);

  const example: MioTrainingExample = {
    schemaVersion: 1,
    id: 'seed:review-001',
    domain: 'GENERAL',
    language: 'id',
    messages: [
      { role: 'user', content: 'Jelaskan kontrol model Mio.' },
      { role: 'assistant', content: 'Model Mio tetap tunduk pada governance dan permission boundary.' },
    ],
    provenance: { kind: 'CURATED', createdAt: 10, reviewer: 'dataset-reviewer' },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  };
  const config: MioTrainingRunConfig = {
    baseModel: 'Qwen/Qwen3-8B',
    targetModel: 'Mio-Local-8B-review-candidate',
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
    trainingMethod: 'QLORA',
    trainedAt: new Date(2_000).toISOString(),
    exampleCount: 1,
    nextRequiredGate: 'MioBench + ModelPromotionGate',
  };
  const registered = await registry.register({
    bundle: bundle.manifest,
    result,
    runtimeModel: 'Mio-Local-8B-review-candidate',
    artifactUri: 'training-artifact://mio-local-8b-review/adapter',
    benchmarkPolicy: { minPassRate: 1, minScoreRatio: 1, requiredDomains: ['GENERAL'] },
  });

  const caseDefinition: MioBenchCase = {
    id: 'release-gate-general',
    domain: 'GENERAL',
    prompt: 'Apa prinsip governance Mio?',
    requiredPhrases: ['governance'],
  };
  const passingProvider: ModelProvider = {
    id: 'local_heuristic',
    displayName: 'Release Candidate Review Fake',
    requiresNetwork: false,
    requiresProxy: false,
    async generate() {
      return {
        provider: 'local_heuristic',
        model: 'Mio-Local-8B-review-candidate',
        text: 'Mio mempertahankan governance sebagai boundary wajib.',
        generatedAt: Date.now(),
        source: 'LOCAL',
      };
    },
  };
  await registry.evaluate(registered.manifest.id, passingProvider, [caseDefinition]);

  const eligible = await reviewService.inspect(registered.candidate.id);
  assert(eligible?.releaseCandidateEligible === true, 'Benchmark policy pass becomes eligible for explicit release-candidate review');
  assert(eligible?.manifest.lifecycle === 'EXPERIMENTAL', 'Eligibility inspection does not mutate candidate lifecycle');

  let missingGovernanceRejected = false;
  try {
    await reviewService.advanceToReleaseCandidate({
      candidateId: registered.candidate.id,
      reviewer: 'release-reviewer',
      dataGovernanceAttested: false,
      securityAttested: true,
    });
  } catch (error) {
    missingGovernanceRejected = error instanceof Error && error.message.includes('Data-governance');
  }
  assert(missingGovernanceRejected, 'Release-candidate gate requires explicit data-governance attestation');

  let missingSecurityRejected = false;
  try {
    await reviewService.advanceToReleaseCandidate({
      candidateId: registered.candidate.id,
      reviewer: 'release-reviewer',
      dataGovernanceAttested: true,
      securityAttested: false,
    });
  } catch (error) {
    missingSecurityRejected = error instanceof Error && error.message.includes('Security review');
  }
  assert(missingSecurityRejected, 'Release-candidate gate requires explicit security attestation');

  const transitioned = await reviewService.advanceToReleaseCandidate({
    candidateId: registered.candidate.id,
    reviewer: 'release-reviewer',
    dataGovernanceAttested: true,
    securityAttested: true,
  });
  assert(transitioned.manifest.lifecycle === 'RELEASE_CANDIDATE', 'Explicit fully-attested review can advance EXPERIMENTAL candidate to RELEASE_CANDIDATE');
  assert(transitioned.manifest.review.dataGovernanceReviewed && transitioned.manifest.review.securityReviewed, 'Release-candidate manifest persists both completed review attestations');
  assert(transitioned.manifest.review.reviewer === 'release-reviewer', 'Release-candidate transition records the named reviewer');
  assert((await manifests.getActivePromoted()) === undefined, 'Release-candidate transition never activates a model');
  assert((await manifests.get(registered.manifest.id))?.lifecycle === 'RELEASE_CANDIDATE', 'Release-candidate lifecycle persists through ModelManifestRepository');

  let secondTransitionRejected = false;
  try {
    await reviewService.advanceToReleaseCandidate({
      candidateId: registered.candidate.id,
      reviewer: 'another-reviewer',
      dataGovernanceAttested: true,
      securityAttested: true,
    });
  } catch (error) {
    secondTransitionRejected = error instanceof Error && error.message.includes('already RELEASE_CANDIDATE');
  }
  assert(secondTransitionRejected, 'Release-candidate transition cannot be replayed as an implicit review overwrite');

  const postTransition = await reviewService.inspect(registered.candidate.id);
  assert(postTransition?.releaseCandidateEligible === false && postTransition?.manifest.lifecycle === 'RELEASE_CANDIDATE', 'Review UI state reflects completed lifecycle transition rather than offering another eligibility action');

  return { passed, total };
}
