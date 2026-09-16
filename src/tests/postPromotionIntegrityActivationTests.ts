import type { AdapterIntegrityHashOutput } from '../platform/desktop/DesktopAdapterIntegrityGateway';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { ModelRouterConfig } from '../types/models';
import { ModelManifestRepository } from '../training/ModelManifestRepository';
import {
  type ModelRouterPreferencePort,
  PromotedModelActivationService,
} from '../training/PromotedModelActivationService';
import { buildTrainingBundle, type MioTrainingRunConfig } from '../training/TrainingBundle';
import { TrainingCandidateRegistry, type MioTrainingResultArtifact } from '../training/TrainingCandidateRegistry';
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
    fileCount: 2,
    totalBytes: 2048,
    limits: { maxFiles: 5000, maxBytes: 4 * 1024 * 1024 * 1024, maxDepth: 24 },
  };
}

export async function runPostPromotionIntegrityActivationTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`PostPromotionIntegrityActivation test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const storage = new InMemoryStorageProvider();
  const manifests = new ModelManifestRepository(storage);
  const candidates = new TrainingCandidateRegistry(storage);
  const integrity = new TrainingCandidateIntegrityService(storage);

  const example: MioTrainingExample = {
    schemaVersion: 1,
    id: 'activation-integrity:001',
    domain: 'GENERAL',
    language: 'id',
    messages: [
      { role: 'user', content: 'Apa batas activation Mio?' },
      { role: 'assistant', content: 'Activation harus memakai model promoted dengan integrity yang tervalidasi.' },
    ],
    provenance: { kind: 'CURATED', createdAt: 1, reviewer: 'activation-integrity-test' },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  };
  const config: MioTrainingRunConfig = {
    baseModel: 'Qwen/Qwen3-8B',
    targetModel: 'Mio-Local-8B-activation-integrity',
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
  const registered = await candidates.register({
    bundle: bundle.manifest,
    result: trainingResult,
    runtimeModel: 'mio-activation-integrity:latest',
    artifactUri: 'local-model://mio-activation-integrity/latest',
    displayName: 'Mio Activation Integrity Candidate',
  });

  const baselineFingerprint = 'a'.repeat(64);
  const driftFingerprint = 'b'.repeat(64);
  const fingerprints = [baselineFingerprint, baselineFingerprint, driftFingerprint, baselineFingerprint];
  const fakePort: CandidateIntegrityDesktopPort = {
    authorizeDirectory: async () => ({ id: 'ws_activation_integrity', name: 'activation-integrity-adapter' }),
    hashDirectory: async () => hashOutput(fingerprints.shift() ?? baselineFingerprint),
    revokeDirectory: async () => undefined,
  };

  const baseline = await integrity.scanCandidate(registered.candidate.id, fakePort);
  if (!baseline.evidence) throw new Error('Baseline integrity evidence was not created');
  const promotedAt = baseline.evidence.scannedAt;
  await manifests.save({
    ...registered.manifest,
    lifecycle: 'PROMOTED',
    review: {
      dataGovernanceReviewed: true,
      securityReviewed: true,
      reviewer: 'final-promoter',
      reviewedAt: promotedAt,
    },
    promotion: {
      promoter: 'final-promoter',
      promotedAt,
      benchmarkReportId: 'bench:activation-integrity:1',
      integrityEvidenceId: baseline.evidence.id,
    },
  });

  let router: ModelRouterConfig = {
    provider: 'local_heuristic',
    mioLocalBackend: 'vllm',
    mioLocalEndpoint: 'http://127.0.0.1:8000',
    allowOfflineFallback: false,
    enableWebSearch: false,
    enableBrowserRead: false,
  };
  const preferences: ModelRouterPreferencePort = {
    getModelRouter: () => ({ ...router }),
    setModelRouter: async (patch) => { router = { ...router, ...patch }; },
  };
  const activation = new PromotedModelActivationService(manifests, preferences, candidates, integrity);

  const originalFetch = globalThis.fetch;
  let readinessCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    readinessCalls += 1;
    if (String(input) === 'http://127.0.0.1:8000/v1/models') {
      return new Response(JSON.stringify({ data: [{ id: 'mio-activation-integrity:latest' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    let blockedWithoutRescan = false;
    try {
      await activation.activatePromoted(registered.manifest.id, { backend: 'vllm' });
    } catch (error) {
      blockedWithoutRescan = error instanceof Error && error.message.includes('new adapter integrity scan is required after promotion');
    }
    check(blockedWithoutRescan, 'Governed adapter candidate requires a new integrity scan after promotion before activation');
    check(readinessCalls === 0 && router.provider === 'local_heuristic', 'Integrity gate runs before runtime readiness or ModelRouter mutation');

    const postPromotionMatch = await integrity.scanCandidate(registered.candidate.id, fakePort);
    check(postPromotionMatch.evidence?.comparison === 'MATCH' && postPromotionMatch.evidence.id !== baseline.evidence.id, 'Post-promotion re-scan must produce new MATCH evidence against immutable baseline');

    const activated = await activation.activatePromoted(registered.manifest.id, { backend: 'vllm' });
    check(activated.integrityEvidenceId === postPromotionMatch.evidence?.id, 'Activation result binds the exact post-promotion integrity evidence used');
    check(router.provider === 'mio_local' && router.model === 'mio-activation-integrity:latest', 'Successful governed activation configures the promoted local runtime only after integrity and readiness pass');
    check((await manifests.getActivePromoted())?.id === registered.manifest.id, 'Successful activation persists the promoted active pointer');

    await integrity.scanCandidate(registered.candidate.id, fakePort);
    const driftStatus = await activation.status();
    check(driftStatus.state === 'INTEGRITY_BLOCKED' && driftStatus.detail.includes('DRIFT'), 'Newly detected byte drift on an active promoted candidate surfaces as INTEGRITY_BLOCKED');
    check(router.provider === 'mio_local' && router.model === 'mio-activation-integrity:latest', 'Integrity drift reporting does not silently switch or deactivate the configured runtime');

    await integrity.scanCandidate(registered.candidate.id, fakePort);
    const restoredStatus = await activation.status();
    check(restoredStatus.state === 'ACTIVE', 'Restoring exact adapter baseline and re-scanning returns promoted runtime status to ACTIVE');
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { passed, total };
}
