import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { ModelProvider } from '../types/models';
import { CandidateLifecyclePipelineService } from '../training/CandidateLifecyclePipelineService';
import type { MioBenchCase } from '../training/MioBench';
import { ModelManifestRepository } from '../training/ModelManifestRepository';
import { buildTrainingBundle, type MioTrainingRunConfig } from '../training/TrainingBundle';
import { TrainingCandidateRegistry, type MioTrainingResultArtifact } from '../training/TrainingCandidateRegistry';
import { TrainingCandidateReviewService } from '../training/TrainingCandidateReviewService';
import type { MioTrainingExample } from '../training/TrainingDataset';

export async function runCandidateLifecyclePipelineTests(): Promise<{ passed: number; total: number }> {
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
  const reviews = new TrainingCandidateReviewService(storage);
  const manifests = new ModelManifestRepository(storage);
  let activationStatusReads = 0;
  const pipeline = new CandidateLifecyclePipelineService(storage, {
    activationStatusProvider: async () => {
      activationStatusReads += 1;
      return {
        state: 'NONE',
        configuredProvider: 'local_heuristic',
        backend: 'ollama',
        detail: 'No promoted model is selected in this isolated pipeline test.',
      };
    },
  });

  const example: MioTrainingExample = {
    schemaVersion: 1,
    id: 'seed:pipeline-001',
    domain: 'GENERAL',
    language: 'id',
    messages: [
      { role: 'user', content: 'Apa prinsip lifecycle model Mio?' },
      { role: 'assistant', content: 'Setiap tahap lifecycle Mio harus melewati governance gate yang sesuai.' },
    ],
    provenance: { kind: 'CURATED', createdAt: 10, reviewer: 'pipeline-dataset-reviewer' },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  };
  const config: MioTrainingRunConfig = {
    baseModel: 'Qwen/Qwen3-8B',
    targetModel: 'Mio-Local-8B-pipeline-candidate',
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
    runtimeModel: config.targetModel,
    artifactUri: 'training-artifact://mio-local-8b-pipeline/adapter',
    benchmarkPolicy: { minPassRate: 1, minScoreRatio: 1, requiredDomains: ['GENERAL'] },
  });

  const candidateBefore = await registry.get(registered.candidate.id);
  const manifestBefore = await manifests.get(registered.manifest.id);
  const initial = await pipeline.inspect(registered.candidate.id);
  const candidateAfterInspect = await registry.get(registered.candidate.id);
  const manifestAfterInspect = await manifests.get(registered.manifest.id);
  assert(Boolean(initial), 'Pipeline can inspect a registered governed training candidate');
  assert(initial?.stages.length === 10, 'Pipeline exposes the complete ten-stage lifecycle projection');
  assert(initial?.stages.find((item) => item.id === 'REGISTERED')?.state === 'COMPLETE', 'Registered candidate stage is complete');
  assert(initial?.stages.find((item) => item.id === 'HANDOFF')?.state === 'NOT_APPLICABLE', 'Legacy/manual governed import does not fabricate a TP-0.58 handoff');
  assert(initial?.stages.find((item) => item.id === 'ADAPTER_INTEGRITY')?.state === 'ACTION_REQUIRED', 'Missing adapter integrity is surfaced as an explicit action');
  assert(initial?.stages.find((item) => item.id === 'MIOBENCH')?.state === 'ACTION_REQUIRED', 'Unevaluated candidate is directed to MioBench');
  assert(initial?.stages.find((item) => item.id === 'PROMOTION')?.state === 'PENDING', 'Promotion stays pending before RELEASE_CANDIDATE');
  assert(initial?.stages.find((item) => item.id === 'ACTIVATION')?.state === 'PENDING', 'Activation stays pending before promotion');
  assert(initial?.nextStageId === 'ADAPTER_INTEGRITY', 'Pipeline identifies the first existing actionable gate without executing it');
  assert(JSON.stringify(candidateBefore) === JSON.stringify(candidateAfterInspect), 'Pipeline inspection does not mutate the candidate record');
  assert(JSON.stringify(manifestBefore) === JSON.stringify(manifestAfterInspect), 'Pipeline inspection does not mutate the model manifest');
  assert((await manifests.getActivePromoted()) === undefined, 'Pipeline inspection does not change the active promoted-model pointer');
  assert(activationStatusReads > 0, 'Pipeline reads activation health through the existing activation-status authority instead of inferring ACTIVE from router configuration');

  const benchmarkCase: MioBenchCase = {
    id: 'pipeline-general',
    domain: 'GENERAL',
    prompt: 'Apa prinsip lifecycle model Mio?',
    requiredPhrases: ['governance'],
  };
  const passingProvider: ModelProvider = {
    id: 'local_heuristic',
    displayName: 'Candidate Lifecycle Pipeline Fake',
    requiresNetwork: false,
    requiresProxy: false,
    async generate() {
      return {
        provider: 'local_heuristic',
        model: config.targetModel,
        text: 'Lifecycle model Mio mempertahankan governance pada setiap gate.',
        generatedAt: Date.now(),
        source: 'LOCAL',
      };
    },
  };
  await registry.evaluate(registered.manifest.id, passingProvider, [benchmarkCase]);
  const benchmarked = await pipeline.inspect(registered.candidate.id);
  assert(benchmarked?.stages.find((item) => item.id === 'MIOBENCH')?.state === 'COMPLETE', 'MioBench policy pass is reflected as complete');
  assert(benchmarked?.stages.find((item) => item.id === 'RELEASE_REVIEW')?.state === 'ACTION_REQUIRED', 'Eligible EXPERIMENTAL candidate is routed to explicit release review');
  assert(benchmarked?.lifecycle === 'EXPERIMENTAL', 'Pipeline refresh never advances EXPERIMENTAL lifecycle by itself');

  await reviews.advanceToReleaseCandidate({
    candidateId: registered.candidate.id,
    reviewer: 'pipeline-release-reviewer',
    dataGovernanceAttested: true,
    securityAttested: true,
  });
  const releaseCandidateBefore = await manifests.get(registered.manifest.id);
  const releasePipeline = await pipeline.inspect(registered.candidate.id);
  const releaseCandidateAfter = await manifests.get(registered.manifest.id);
  const promotionStage = releasePipeline?.stages.find((item) => item.id === 'PROMOTION');
  assert(releasePipeline?.lifecycle === 'RELEASE_CANDIDATE', 'Pipeline reflects explicit release-candidate transition from the existing review service');
  assert(releasePipeline?.stages.find((item) => item.id === 'RELEASE_REVIEW')?.state === 'COMPLETE', 'Release review is complete after explicit transition');
  assert(promotionStage?.state === 'BLOCKED', 'Promotion stage delegates readiness to existing promotion policy and can remain blocked');
  assert(promotionStage?.blockers?.some((reason) => reason.includes('Adapter byte-integrity evidence is required before promotion')) === true, 'Existing promotion blocker is surfaced without being reinterpreted as approval');
  assert(releasePipeline?.overallState === 'BLOCKED', 'Any authoritative blocked gate produces BLOCKED overall pipeline state');
  assert(JSON.stringify(releaseCandidateBefore) === JSON.stringify(releaseCandidateAfter), 'Pipeline inspection does not mutate RELEASE_CANDIDATE state');
  assert((await manifests.getActivePromoted()) === undefined, 'Pipeline cannot implicitly promote or activate a RELEASE_CANDIDATE');

  const listedBefore = await registry.get(registered.candidate.id);
  const listResult = await pipeline.list();
  const listedAfter = await registry.get(registered.candidate.id);
  assert(listResult.length === 1 && listResult[0].candidateId === registered.candidate.id, 'Pipeline list projects registered candidates without creating synthetic records');
  assert(JSON.stringify(listedBefore) === JSON.stringify(listedAfter), 'Pipeline list refresh is read-only for candidate storage');

  return { passed, total };
}
