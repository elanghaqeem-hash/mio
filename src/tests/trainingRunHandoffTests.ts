import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { ModelManifestRepository } from '../training/ModelManifestRepository';
import { buildTrainingBundle, type MioTrainingRunConfig } from '../training/TrainingBundle';
import type { MioTrainingExample } from '../training/TrainingDataset';
import type { MioTrainingResultArtifact } from '../training/TrainingCandidateRegistry';
import { buildTrainingRunHandoff, verifyTrainingRunHandoff } from '../training/TrainingRunHandoff';
import { TrainingRunHandoffService } from '../training/TrainingRunHandoffService';

export async function runTrainingRunHandoffTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`TrainingRunHandoff test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const example: MioTrainingExample = {
    schemaVersion: 1,
    id: 'handoff:001',
    domain: 'GENERAL',
    language: 'id',
    messages: [
      { role: 'user', content: 'Apa status model setelah training?' },
      { role: 'assistant', content: 'TRAINED_NOT_EVALUATED sampai MioBench dan promotion gate selesai.' },
    ],
    provenance: { kind: 'CURATED', createdAt: 1, reviewer: 'handoff-test' },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  };
  const config: MioTrainingRunConfig = {
    baseModel: 'Qwen/Qwen3-8B',
    targetModel: 'Mio-Local-8B-handoff-test',
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
    disclosure: 'Handoff test result.',
  };

  const handoff = await buildTrainingRunHandoff(bundle, result, 3_000);
  const handoffJson = JSON.stringify(handoff);
  const verified = await verifyTrainingRunHandoff(handoffJson);
  check(verified.valid && verified.bundle?.manifest.bundleId === bundle.manifest.bundleId, 'Valid handoff re-verifies the embedded governed training bundle');
  check(verified.trainingResultSha256 === handoff.fingerprints.trainingResultSha256, 'Valid handoff re-computes the exact training-result SHA-256');
  check(verified.handoffSha256 === handoff.handoffSha256, 'Valid handoff re-computes the deterministic handoff SHA-256');

  const tamperedDataset = structuredClone(handoff);
  tamperedDataset.bundle.trainingJsonl += ' ';
  const datasetResult = await verifyTrainingRunHandoff(JSON.stringify(tamperedDataset));
  check(!datasetResult.valid && datasetResult.errors.some((error) => error.toLowerCase().includes('dataset sha-256')), 'Dataset tampering is rejected by embedded bundle verification');

  const tamperedResult = structuredClone(handoff);
  tamperedResult.result.bundleId = 'mio-train-tampered';
  const resultVerification = await verifyTrainingRunHandoff(JSON.stringify(tamperedResult));
  check(!resultVerification.valid && resultVerification.errors.some((error) => error.toLowerCase().includes('bundleid')), 'Training-result binding tampering is rejected');

  const tamperedDigest = structuredClone(handoff);
  tamperedDigest.handoffSha256 = '0'.repeat(64);
  const digestVerification = await verifyTrainingRunHandoff(JSON.stringify(tamperedDigest));
  check(!digestVerification.valid && digestVerification.errors.some((error) => error.toLowerCase().includes('digest mismatch')), 'Handoff digest tampering is rejected');

  const storage = new InMemoryStorageProvider();
  const service = new TrainingRunHandoffService(storage);
  const registered = await service.register({
    handoffJson,
    runtimeModel: 'mio-handoff-test:latest',
    artifactUri: 'local-model://mio-handoff-test/latest',
    displayName: 'Mio Handoff Test Candidate',
  });
  check(registered.candidate.status === 'REGISTERED_UNEVALUATED', 'Verified handoff registration creates only an unevaluated candidate');

  const manifests = new ModelManifestRepository(storage);
  const manifest = await manifests.get(registered.candidate.manifestId);
  check(manifest?.lifecycle === 'EXPERIMENTAL', 'Handoff registration leaves model lifecycle EXPERIMENTAL');
  check((await manifests.getActivePromoted()) === undefined, 'Handoff registration never creates an active promoted-model pointer');

  let invalidRegistrationBlocked = false;
  try {
    await service.register({
      handoffJson: JSON.stringify(tamperedDigest),
      runtimeModel: 'mio-handoff-test:latest',
      artifactUri: 'local-model://mio-handoff-test/latest',
    });
  } catch (error) {
    invalidRegistrationBlocked = error instanceof Error && error.message.toLowerCase().includes('registration blocked');
  }
  check(invalidRegistrationBlocked, 'Candidate registration is fail-closed when handoff verification fails');

  return { passed, total };
}
