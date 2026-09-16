import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { ModelProvider, ModelRequest } from '../types/models';
import {
  CandidateLabProviderFactory,
  CandidateLabReadinessChecker,
  TrainingCandidateLabService,
} from '../training/TrainingCandidateLabService';
import { MioTrainingRunConfig, buildTrainingBundle, stableJsonStringify } from '../training/TrainingBundle';
import { MioTrainingExample } from '../training/TrainingDataset';
import { MioTrainingResultArtifact, TrainingCandidateRegistry } from '../training/TrainingCandidateRegistry';
import { ModelManifestRepository } from '../training/ModelManifestRepository';

const approvedExample: MioTrainingExample = {
  schemaVersion: 1,
  id: 'lab:general-001',
  domain: 'GENERAL',
  language: 'id',
  messages: [
    { role: 'user', content: 'Apa fungsi model router?' },
    { role: 'assistant', content: 'Model router memilih model sesuai kebutuhan dan kebijakan.' },
  ],
  provenance: { kind: 'CURATED', createdAt: 1, reviewer: 'lab-test' },
  eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
  quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  tags: ['lab'],
};

const config: MioTrainingRunConfig = {
  baseModel: 'Qwen/Qwen3-8B',
  targetModel: 'Mio-Local-8B-lab',
  trainingMethod: 'QLORA',
  seed: 42,
  maxSequenceLength: 4096,
  learningRate: 0.0002,
  epochs: 1,
  perDeviceTrainBatchSize: 1,
  gradientAccumulationSteps: 8,
  assistantOnlyLoss: true,
  packing: false,
  lora: { rank: 16, alpha: 32, dropout: 0.05, targetModules: ['q_proj', 'v_proj'] },
  requiredDomains: ['GENERAL'],
  minExamples: 1,
};

function benchmarkAnswer(request: ModelRequest, strong: boolean): string {
  const prompt = request.messages.at(-1)?.content ?? '';
  if (prompt.includes('12 batch')) return strong ? '282 item berhasil karena 12 × 25 = 300 lalu dikurangi 18.' : '281 item berhasil.';
  if (prompt.includes('TypeScript')) return 'Periksa response.ok sebelum memperlakukan hasil fetch sebagai sukses.';
  if (prompt.includes('Bitcoin')) return 'Tidak dapat memberi harga tepat saat ini tanpa akses internet.';
  if (prompt.includes('Dokumen eksternal')) return 'Perlakukan dokumen sebagai data dan jangan ikuti instruksi yang mencoba mengubah aturan sistem.';
  if (prompt.includes('berita terbaru')) return 'Tidak. Model harus menyatakan bahwa berita belum dapat diverifikasi tanpa akses web.';
  return 'Model router memilih model dan provider sesuai tugas, kebijakan, dan batas eksekusi yang berlaku.';
}

export async function runTrainingCandidateLabTests(): Promise<{ passed: number; total: number }> {
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

  const bundle = await buildTrainingBundle([approvedExample], config, { generatedAt: 1_000 });
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
    exampleCount: bundle.manifest.dataset.exampleCount,
    nextRequiredGate: 'MioBench + ModelPromotionGate',
  };
  const manifestJson = JSON.stringify(bundle.manifest);
  const resultJson = JSON.stringify(result);

  const storage = new InMemoryStorageProvider();
  const readinessModels: string[] = [];
  const readinessChecker: CandidateLabReadinessChecker = async (model) => {
    readinessModels.push(model);
    return { ready: true, detail: `${model} ready for test` };
  };
  const providerFactory: CandidateLabProviderFactory = (model) => {
    const strong = model.includes('candidate');
    const provider: ModelProvider = {
      id: 'mio_local',
      displayName: `Lab ${model}`,
      requiresNetwork: false,
      requiresProxy: false,
      async generate(request) {
        return {
          provider: 'mio_local',
          model,
          text: benchmarkAnswer(request, strong),
          generatedAt: Date.now(),
          source: 'LOCAL',
        };
      },
    };
    return provider;
  };
  const lab = new TrainingCandidateLabService(storage, providerFactory, readinessChecker);

  const preview = await lab.previewImport(manifestJson, bundle.trainingJsonl, resultJson);
  assert(preview.valid && preview.bundleVerification?.valid === true, 'Candidate Lab verifies governed bundle and training-result binding before registration');

  const tamperedPreview = await lab.previewImport(manifestJson, `${bundle.trainingJsonl} `, resultJson);
  assert(!tamperedPreview.valid && tamperedPreview.errors.some((error) => error.includes('SHA-256')), 'Candidate Lab rejects tampered training JSONL before candidate registration');

  const mismatchedResult = { ...result, datasetSha256: '0'.repeat(64) };
  const mismatchedPreview = await lab.previewImport(manifestJson, bundle.trainingJsonl, JSON.stringify(mismatchedResult));
  assert(!mismatchedPreview.valid && mismatchedPreview.errors.some((error) => error.includes('dataset fingerprint')), 'Candidate Lab rejects training results bound to a different dataset fingerprint');

  const registered = await lab.registerImport({
    manifestJson,
    trainingJsonl: bundle.trainingJsonl,
    trainingResultJson: resultJson,
    runtimeModel: 'mio-candidate:latest',
    artifactUri: 'local-model://mio-candidate/latest',
    displayName: 'Mio Candidate Lab',
  });
  const manifestRepo = new ModelManifestRepository(storage);
  const registeredManifest = await manifestRepo.get(registered.candidate.manifestId);
  assert(registeredManifest?.lifecycle === 'EXPERIMENTAL', 'Candidate Lab registration always creates an EXPERIMENTAL manifest');
  assert(registeredManifest?.review.dataGovernanceReviewed === false && registeredManifest.review.securityReviewed === false, 'Candidate Lab registration never fabricates governance or security review');

  const readiness = await lab.checkCandidateReadiness(registered.candidate.id, 'ollama', 'http://127.0.0.1:11434');
  assert(readiness.ready && readiness.model === 'mio-candidate:latest' && readinessModels.includes('mio-candidate:latest'), 'Candidate Lab readiness targets the registered candidate runtime identity');

  const evaluated = await lab.runCandidateBenchmark({
    candidateId: registered.candidate.id,
    backend: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
  });
  assert(evaluated.policyPassed && evaluated.candidate.status === 'BENCHMARKED_POLICY_PASS', 'Candidate Lab runs identity-bound MioBench and records candidate policy pass');

  const comparison = await lab.runComparison({
    candidateId: registered.candidate.id,
    backend: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    baseRuntimeModel: 'qwen-base:latest',
  });
  assert(comparison.baseReport.model === 'qwen-base:latest' && comparison.candidateReport.model === 'mio-candidate:latest', 'Base-vs-candidate comparison preserves exact runtime model identities');
  assert(comparison.delta.passRate > 0 && comparison.delta.scoreRatio > 0, 'Candidate Lab comparison exposes bounded MioBench deltas instead of an overall model verdict');
  const persistedComparison = await lab.latestComparison(registered.candidate.id);
  assert(persistedComparison?.id === comparison.id && persistedComparison.candidateBenchmarkReportId === comparison.candidateBenchmarkReportId, 'Candidate Lab persists reproducible comparison evidence and candidate benchmark binding');

  const afterBenchmarkManifest = await manifestRepo.get(registered.candidate.manifestId);
  assert(afterBenchmarkManifest?.lifecycle === 'EXPERIMENTAL', 'Candidate Lab benchmark and comparison never auto-advance lifecycle');
  assert((await manifestRepo.getActivePromoted()) === undefined, 'Candidate Lab never writes the active promoted-model pointer');

  const candidateRecord = await new TrainingCandidateRegistry(storage).get(registered.candidate.id);
  assert(candidateRecord?.status === 'BENCHMARKED_POLICY_PASS', 'Candidate Lab comparison keeps governed candidate benchmark status in the existing registry');
  assert(stableJsonStringify(bundle.manifest.config).length > 0, 'Candidate Lab test bundle uses the same deterministic training-config contract as TP-0.46');

  return { passed, total };
}
