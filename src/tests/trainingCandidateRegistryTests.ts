import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { ModelProvider } from '../types/models';
import { MioBenchCase } from '../training/MioBench';
import { ModelManifestRepository } from '../training/ModelManifestRepository';
import { buildTrainingBundle, MioTrainingRunConfig } from '../training/TrainingBundle';
import { MioTrainingExample } from '../training/TrainingDataset';
import { MioTrainingResultArtifact, TrainingCandidateRegistry } from '../training/TrainingCandidateRegistry';

export async function runTrainingCandidateRegistryTests(): Promise<{ passed: number; total: number }> {
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
  const manifests = new ModelManifestRepository(storage);

  const example: MioTrainingExample = {
    schemaVersion: 1,
    id: 'seed:candidate-001',
    domain: 'GENERAL',
    language: 'id',
    messages: [
      { role: 'user', content: 'Apa fungsi Mio?' },
      { role: 'assistant', content: 'Mio membantu tugas AI melalui runtime yang terkontrol.' },
    ],
    provenance: { kind: 'CURATED', createdAt: 10, reviewer: 'reviewer' },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  };
  const config: MioTrainingRunConfig = {
    baseModel: 'Qwen/Qwen3-8B',
    targetModel: 'Mio-Local-8B-v1-candidate',
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
    runtimeModel: 'Mio-Local-8B-v1-candidate',
    artifactUri: 'training-artifact://mio-local-8b-v1/adapter',
    benchmarkPolicy: { minPassRate: 1, minScoreRatio: 1, requiredDomains: ['GENERAL'] },
  });
  assert(registered.manifest.lifecycle === 'EXPERIMENTAL', 'Training result registration always starts as EXPERIMENTAL');
  assert(!registered.manifest.review.dataGovernanceReviewed && !registered.manifest.review.securityReviewed, 'Training result cannot auto-complete promotion reviews');
  assert(registered.candidate.status === 'REGISTERED_UNEVALUATED', 'New training candidate is explicitly unevaluated');
  assert(registered.candidate.datasetSha256 === bundle.manifest.dataset.sha256 && registered.candidate.configSha256 === bundle.manifest.reproducibility.configSha256, 'Candidate binds exact bundle dataset and config fingerprints');
  assert((await manifests.getActivePromoted()) === undefined, 'Candidate registration cannot change the active promoted model');

  let tamperedRejected = false;
  try {
    await registry.register({
      bundle: bundle.manifest,
      result: { ...result, datasetSha256: '0'.repeat(64) },
      runtimeModel: 'Mio-Local-8B-v1-candidate',
      artifactUri: 'training-artifact://tampered/adapter',
    });
  } catch (error) {
    tamperedRejected = error instanceof Error && error.message.includes('dataset fingerprint');
  }
  assert(tamperedRejected, 'Candidate registration rejects a training result whose dataset fingerprint does not match');

  let unsafeUriRejected = false;
  try {
    await registry.register({ bundle: bundle.manifest, result, runtimeModel: 'Mio-Local-8B-v1-candidate', artifactUri: 'https://example.com/adapter' });
  } catch (error) {
    unsafeUriRejected = error instanceof Error && error.message.includes('artifactUri');
  }
  assert(unsafeUriRejected, 'Candidate registry rejects remote HTTP artifact URIs');

  const passingCase: MioBenchCase = {
    id: 'candidate-general',
    domain: 'GENERAL',
    prompt: 'Jawab singkat.',
    requiredPhrases: ['terkontrol'],
  };
  const passingProvider: ModelProvider = {
    id: 'local_heuristic',
    displayName: 'Candidate Test Provider',
    requiresNetwork: false,
    requiresProxy: false,
    async generate() {
      return {
        provider: 'local_heuristic',
        model: 'Mio-Local-8B-v1-candidate',
        text: 'Mio berjalan secara terkontrol.',
        generatedAt: Date.now(),
        source: 'LOCAL',
      };
    },
  };
  const evaluated = await registry.evaluate(registered.manifest.id, passingProvider, [passingCase]);
  assert(evaluated.policyPassed && evaluated.candidate.status === 'BENCHMARKED_POLICY_PASS', 'Identity-matched candidate can record a benchmark policy pass');
  assert(evaluated.manifest.lifecycle === 'EXPERIMENTAL', 'Benchmark policy pass does not auto-promote or auto-advance lifecycle');
  assert(Boolean(evaluated.candidate.latestBenchmarkReportId), 'Candidate benchmark is persisted and bound to its model manifest');
  assert((await manifests.getActivePromoted()) === undefined, 'Benchmarking a candidate cannot activate it');

  const mismatchProvider: ModelProvider = {
    ...passingProvider,
    async generate() {
      return {
        provider: 'local_heuristic',
        model: 'different-model',
        text: 'Mio berjalan secara terkontrol.',
        generatedAt: Date.now(),
        source: 'LOCAL',
      };
    },
  };
  let identityMismatchRejected = false;
  try {
    await registry.evaluate(registered.manifest.id, mismatchProvider, [passingCase]);
  } catch (error) {
    identityMismatchRejected = error instanceof Error && error.message.includes('identity mismatch');
  }
  assert(identityMismatchRejected, 'Benchmark report cannot bind to a different runtime model identity');

  const persisted = await registry.get(registered.candidate.id);
  assert(persisted?.status === 'BENCHMARKED_POLICY_PASS', 'Rejected identity mismatch does not overwrite the last valid candidate benchmark state');

  return { passed, total };
}
