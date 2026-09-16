import { buildTrainingBundle, MioTrainingRunConfig, stableJsonStringify, validateTrainingRunConfig } from '../training/TrainingBundle';
import { verifyTrainingBundle } from '../training/TrainingBundleVerifier';
import { MioTrainingExample } from '../training/TrainingDataset';

export async function runTrainingBundleTests(): Promise<{ passed: number; total: number }> {
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

  const config: MioTrainingRunConfig = {
    baseModel: 'Qwen/Qwen3-8B',
    targetModel: 'Mio-Local-8B-v1-candidate',
    trainingMethod: 'QLORA',
    seed: 42,
    maxSequenceLength: 4096,
    learningRate: 0.0002,
    epochs: 2,
    perDeviceTrainBatchSize: 1,
    gradientAccumulationSteps: 16,
    assistantOnlyLoss: true,
    packing: false,
    lora: { rank: 32, alpha: 64, dropout: 0.05 },
    requiredDomains: ['GENERAL', 'SAFETY'],
    minExamples: 2,
  };

  const example = (id: string, domain: 'GENERAL' | 'SAFETY', content: string): MioTrainingExample => ({
    schemaVersion: 1,
    id,
    domain,
    language: 'id',
    messages: [
      { role: 'user', content: `Pertanyaan ${id}` },
      { role: 'assistant', content },
    ],
    provenance: { kind: 'CURATED', createdAt: 10, reviewer: 'test-reviewer' },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
    tags: ['approved', domain.toLowerCase()],
  });

  const general = example('seed:general-001', 'GENERAL', 'Jawaban umum yang telah direview.');
  const safety = example('seed:safety-001', 'SAFETY', 'Jawaban safety yang telah direview.');
  const excluded: MioTrainingExample = {
    ...example('feedback:pending-001', 'GENERAL', 'Kandidat yang belum diizinkan.'),
    provenance: { kind: 'USER_CONTRIBUTED', createdAt: 11, reviewer: 'test-reviewer' },
    eligibility: { trainingApproved: false, privacyReviewed: true, copyrightReviewed: true },
  };

  assert(validateTrainingRunConfig(config).valid, 'Training run config accepts bounded QLoRA settings');

  const bundle = await buildTrainingBundle([safety, excluded, general], config, { generatedAt: 100 });
  assert(bundle.manifest.dataset.exampleCount === 2 && bundle.manifest.dataset.excludedCount === 1, 'Bundle exports only eligible examples while auditing excluded count');
  assert(bundle.manifest.dataset.eligibleExampleIds.join(',') === 'seed:general-001,seed:safety-001', 'Eligible examples are deterministically sorted by id');
  assert(bundle.manifest.dataset.excludedExamples[0]?.id === 'feedback:pending-001' && bundle.manifest.dataset.excludedExamples[0]?.reasons.some((reason) => reason.includes('training approval')), 'Excluded record stores bounded governance reasons without exporting its content');
  assert(!bundle.trainingJsonl.includes('Kandidat yang belum diizinkan.'), 'Ineligible user-contributed content is absent from training JSONL');
  assert(bundle.manifest.promotionStatus === 'NOT_EVALUATED', 'Fresh training bundle cannot claim promotion or evaluation');

  const reordered = await buildTrainingBundle([general, safety, excluded], config, { generatedAt: 999 });
  assert(bundle.trainingJsonl === reordered.trainingJsonl, 'Dataset bytes are deterministic regardless of input order');
  assert(bundle.manifest.bundleId === reordered.manifest.bundleId && bundle.manifest.dataset.sha256 === reordered.manifest.dataset.sha256, 'Bundle identity ignores audit timestamp and depends on dataset/config fingerprints');
  assert(stableJsonStringify(bundle.manifest.config) === stableJsonStringify(reordered.manifest.config), 'Normalized training config is deterministic');

  const verification = await verifyTrainingBundle(bundle);
  assert(verification.valid && verification.exampleCount === 2, 'Generated governed training bundle verifies successfully');

  const tampered = { ...bundle, trainingJsonl: `${bundle.trainingJsonl} ` };
  const tamperedVerification = await verifyTrainingBundle(tampered);
  assert(!tamperedVerification.valid && tamperedVerification.errors.some((error) => error.includes('SHA-256')), 'Dataset tampering is detected before training');

  let missingDomainRejected = false;
  try {
    await buildTrainingBundle([general], { ...config, minExamples: 1 }, { generatedAt: 100 });
  } catch (error) {
    missingDomainRejected = error instanceof Error && error.message.includes('missing required domain');
  }
  assert(missingDomainRejected, 'Required-domain gate rejects an incomplete training bundle');

  let duplicateRejected = false;
  try {
    await buildTrainingBundle([general, { ...general }], { ...config, requiredDomains: ['GENERAL'], minExamples: 1 });
  } catch (error) {
    duplicateRejected = error instanceof Error && error.message.includes('Duplicate training example ids');
  }
  assert(duplicateRejected, 'Duplicate training example ids fail closed');

  const invalid = validateTrainingRunConfig({ ...config, learningRate: 2, lora: { ...config.lora, dropout: 1 } });
  assert(!invalid.valid && invalid.errors.length >= 2, 'Unsafe/out-of-range training hyperparameters are rejected');

  return { passed, total };
}
