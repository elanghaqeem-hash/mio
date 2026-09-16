import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { BenchmarkReportRepository } from '../training/BenchmarkReportRepository';
import { ModelManifestRepository } from '../training/ModelManifestRepository';
import {
  TrainingCandidateEvidencePackageService,
  verifyCandidateEvidencePackage,
  type MioCandidateEvidencePackage,
} from '../training/TrainingCandidateEvidencePackage';
import { buildTrainingBundle, sha256Hex, stableJsonStringify, type MioTrainingRunConfig } from '../training/TrainingBundle';
import type { MioTrainingExample } from '../training/TrainingDataset';
import type { MioTrainingResultArtifact } from '../training/TrainingCandidateRegistry';
import { buildTrainingRunHandoff } from '../training/TrainingRunHandoff';
import { TrainingRunHandoffService } from '../training/TrainingRunHandoffService';

interface SuiteResult { passed: number; total: number; }

async function recomputePackageDigest(value: MioCandidateEvidencePackage): Promise<MioCandidateEvidencePackage> {
  const next = structuredClone(value);
  const body = structuredClone(next) as unknown as Record<string, unknown>;
  delete body.packageSha256;
  next.packageSha256 = await sha256Hex(stableJsonStringify(body));
  return next;
}

export async function runTrainingCandidateEvidencePackageTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`TrainingCandidateEvidencePackage test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const privateTrainingQuestion = 'PRIVATE_TRAINING_QUESTION_SHOULD_NEVER_EXPORT';
  const privateTrainingAnswer = 'PRIVATE_TRAINING_ANSWER_SHOULD_NEVER_EXPORT';
  const benchmarkOutput = 'BENCHMARK_RAW_OUTPUT_SHOULD_NEVER_EXPORT';
  const example: MioTrainingExample = {
    schemaVersion: 1,
    id: 'candidate-evidence:001',
    domain: 'GENERAL',
    language: 'id',
    messages: [
      { role: 'user', content: privateTrainingQuestion },
      { role: 'assistant', content: privateTrainingAnswer },
    ],
    provenance: { kind: 'CURATED', createdAt: 1, reviewer: 'evidence-package-test' },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  };
  const config: MioTrainingRunConfig = {
    baseModel: 'Qwen/Qwen3-8B',
    targetModel: 'Mio-Local-8B-evidence-package-test',
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
  const storage = new InMemoryStorageProvider();
  const registration = await new TrainingRunHandoffService(storage).register({
    handoffJson: JSON.stringify(handoff),
    runtimeModel: 'mio-evidence-package-test:latest',
    artifactUri: 'local-model://mio-evidence-package-test/latest',
    displayName: 'Mio Evidence Package Test Candidate',
  });

  await new BenchmarkReportRepository(storage).save(registration.candidate.manifestId, {
    provider: 'test-provider',
    model: 'mio-evidence-package-test:latest',
    generatedAt: 4_000,
    score: 1,
    maxScore: 1,
    passRate: 1,
    results: [{
      id: 'evidence-bench-1',
      domain: 'GENERAL',
      score: 1,
      maxScore: 1,
      passed: true,
      failures: [],
      output: benchmarkOutput,
      latencyMs: 12,
    }],
  });

  const service = new TrainingCandidateEvidencePackageService(storage);
  const exportedAt = 5_000;
  const pkg = await service.export(registration.candidate.id, exportedAt);
  const json = JSON.stringify(pkg);
  const verification = await verifyCandidateEvidencePackage(json);
  check(verification.valid && verification.packageSha256 === pkg.packageSha256, 'Exported candidate evidence package self-verifies with deterministic SHA-256');
  check(pkg.kind === 'MIO_CANDIDATE_EVIDENCE_PACKAGE_V1' && pkg.manifest.lifecycle === 'EXPERIMENTAL', 'Evidence export preserves candidate lifecycle without changing it');
  check(pkg.evidence.handoffReceipt?.handoffSha256 === handoff.handoffSha256, 'Evidence package carries the verified TP-0.58 handoff receipt identity');
  check(pkg.evidence.latestBenchmark?.sourceReportSha256.length === 64, 'Benchmark evidence binds a SHA-256 of the complete stored source report');
  check(pkg.evidence.latestBenchmark?.results[0]?.id === 'evidence-bench-1', 'Benchmark evidence retains bounded case scoring metadata');
  check(!json.includes(benchmarkOutput), 'Raw benchmark model output is omitted from the portable evidence package');
  check(!json.includes(privateTrainingQuestion) && !json.includes(privateTrainingAnswer), 'Training example message content is never copied into the portable evidence package');
  check(!json.includes('trainingJsonl'), 'Portable evidence package contains no training JSONL field');

  const repeated = await service.export(registration.candidate.id, exportedAt);
  check(repeated.packageSha256 === pkg.packageSha256 && stableJsonStringify(repeated) === stableJsonStringify(pkg), 'Same candidate state + export timestamp yields deterministic evidence package bytes');

  const tamperedDigest = structuredClone(pkg);
  tamperedDigest.packageSha256 = '0'.repeat(64);
  const tamperedDigestVerification = await verifyCandidateEvidencePackage(JSON.stringify(tamperedDigest));
  check(!tamperedDigestVerification.valid && tamperedDigestVerification.errors.some((error) => error.includes('digest mismatch')), 'Package digest tampering is rejected');

  const reboundIdentity = structuredClone(pkg);
  reboundIdentity.candidate.bundleId = 'mio-train-rebound';
  const reboundIdentityWithValidDigest = await recomputePackageDigest(reboundIdentity);
  const reboundIdentityVerification = await verifyCandidateEvidencePackage(JSON.stringify(reboundIdentityWithValidDigest));
  check(!reboundIdentityVerification.valid && reboundIdentityVerification.errors.some((error) => error.includes('bundleId')), 'Candidate identity rebinding is rejected even when attacker recomputes package digest');

  const injectedSecret = structuredClone(pkg) as MioCandidateEvidencePackage & { evidence: MioCandidateEvidencePackage['evidence'] & { trainingJsonl?: string } };
  injectedSecret.evidence.trainingJsonl = 'forbidden raw training data';
  const injectedSecretWithValidDigest = await recomputePackageDigest(injectedSecret);
  const secretVerification = await verifyCandidateEvidencePackage(JSON.stringify(injectedSecretWithValidDigest));
  check(
    !secretVerification.valid
      && secretVerification.errors.some((error) => error.includes('forbidden portable field'))
      && secretVerification.errors.some((error) => error.includes('Unknown candidate evidence field')),
    'Sensitive/unknown evidence fields are rejected even when package digest is recomputed',
  );

  const unknownTopLevel = structuredClone(pkg) as MioCandidateEvidencePackage & { extraAuditPayload?: string };
  unknownTopLevel.extraAuditPayload = 'not-covered-by-schema';
  const unknownTopLevelWithValidDigest = await recomputePackageDigest(unknownTopLevel);
  const unknownVerification = await verifyCandidateEvidencePackage(JSON.stringify(unknownTopLevelWithValidDigest));
  check(!unknownVerification.valid && unknownVerification.errors.some((error) => error.includes('Unknown candidate evidence package top-level field')), 'Unknown top-level fields cannot bypass the canonical package schema');

  const manifests = new ModelManifestRepository(storage);
  check((await manifests.get(registration.candidate.manifestId))?.lifecycle === 'EXPERIMENTAL', 'Evidence export and verification never advance model lifecycle');
  check((await manifests.getActivePromoted()) === undefined, 'Evidence export and verification never create an active promoted-model pointer');

  return { passed, total };
}
