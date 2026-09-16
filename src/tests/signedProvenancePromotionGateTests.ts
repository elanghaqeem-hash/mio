import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { ModelProvider, ModelRouterConfig } from '../types/models';
import type { AdapterIntegrityHashOutput } from '../platform/desktop/DesktopAdapterIntegrityGateway';
import { buildTrainingBundle, stableJsonStringify, type MioTrainingRunConfig } from '../training/TrainingBundle';
import type { MioTrainingExample } from '../training/TrainingDataset';
import type { MioBenchCase } from '../training/MioBench';
import { TrainingCandidateRegistry, type MioTrainingResultArtifact } from '../training/TrainingCandidateRegistry';
import { TrainingCandidateIntegrityService, type CandidateIntegrityDesktopPort } from '../training/TrainingCandidateIntegrityService';
import {
  ModelSignerTrustStore,
  TrainingCandidateProvenanceService,
  type MioArtifactProvenancePayload,
  type MioSignedArtifactProvenanceEnvelope,
} from '../training/SignedModelArtifactProvenance';
import { TrainingCandidateReviewService } from '../training/TrainingCandidateReviewService';
import { ModelPromotionService } from '../training/ModelPromotionService';
import { ModelManifestRepository } from '../training/ModelManifestRepository';
import {
  type ModelRouterPreferencePort,
  PromotedModelActivationService,
} from '../training/PromotedModelActivationService';

interface SuiteResult { passed: number; total: number; }

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function signer(): Promise<{ privateKey: CryptoKey; publicKey: string }> {
  const pair = await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = await globalThis.crypto.subtle.exportKey('spki', pair.publicKey);
  return { privateKey: pair.privateKey, publicKey: toBase64(new Uint8Array(spki)) };
}

async function envelope(payload: MioArtifactProvenancePayload, privateKey: CryptoKey, keyId: string): Promise<MioSignedArtifactProvenanceEnvelope> {
  const signature = await globalThis.crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(stableJsonStringify(payload)),
  );
  return {
    schemaVersion: 1,
    payload,
    signature: { algorithm: 'ECDSA_P256_SHA256', keyId, valueBase64: toBase64(new Uint8Array(signature)) },
  };
}

export async function runSignedProvenancePromotionGateTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`SignedProvenancePromotionGate test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const storage = new InMemoryStorageProvider();
  const trainingExample: MioTrainingExample = {
    schemaVersion: 1,
    id: 'signed-promotion:001',
    domain: 'GENERAL',
    language: 'id',
    messages: [
      { role: 'user', content: 'Apa itu signed provenance?' },
      { role: 'assistant', content: 'Signed provenance mengikat artifact dengan penandatangan yang dipercaya.' },
    ],
    provenance: { kind: 'CURATED', createdAt: 1, reviewer: 'signed-promotion-test' },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  };
  const config: MioTrainingRunConfig = {
    baseModel: 'Qwen/Qwen3-8B',
    targetModel: 'Mio-Local-8B-signed-promotion',
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
  const bundle = await buildTrainingBundle([trainingExample], config, { generatedAt: 1_000 });
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
    trainedAt: new Date(2_000).toISOString(),
    exampleCount: 1,
    nextRequiredGate: 'MioBench + ModelPromotionGate',
  };

  const registry = new TrainingCandidateRegistry(storage);
  const registered = await registry.register({
    bundle: bundle.manifest,
    result: trainingResult,
    runtimeModel: 'mio-signed-promotion:latest',
    artifactUri: 'local-model://mio-signed-promotion/latest',
    benchmarkPolicy: { minPassRate: 1, minScoreRatio: 1, requiredDomains: ['GENERAL'] },
  });
  const benchCase: MioBenchCase = {
    id: 'signed-promotion-general',
    domain: 'GENERAL',
    prompt: 'Apa itu signed provenance?',
    requiredPhrases: ['provenance'],
  };
  const provider: ModelProvider = {
    id: 'local_heuristic',
    displayName: 'Signed Promotion Test Provider',
    requiresNetwork: false,
    requiresProxy: false,
    async generate() {
      return {
        provider: 'local_heuristic',
        model: 'mio-signed-promotion:latest',
        text: 'Signed provenance adalah bukti provenance artifact.',
        generatedAt: Date.now(),
        source: 'LOCAL',
      };
    },
  };
  await registry.evaluate(registered.candidate.id, provider, [benchCase]);

  const fingerprint = 'c'.repeat(64);
  const hash: AdapterIntegrityHashOutput = {
    schemaVersion: 1,
    algorithm: 'SHA-256',
    canonicalization: 'mio-adapter-tree-v1',
    rootRelativePath: '.',
    fingerprint,
    fileCount: 2,
    totalBytes: 4096,
    limits: { maxFiles: 5000, maxBytes: 4 * 1024 * 1024 * 1024, maxDepth: 24 },
  };
  const port: CandidateIntegrityDesktopPort = {
    authorizeDirectory: async () => ({ id: 'ws_signed_promotion', name: 'signed-promotion-adapter' }),
    hashDirectory: async () => hash,
    revokeDirectory: async () => undefined,
  };
  const integrity = new TrainingCandidateIntegrityService(storage);
  await integrity.scanCandidate(registered.candidate.id, port);

  const keys = new ModelSignerTrustStore(storage);
  const provenance = new TrainingCandidateProvenanceService(storage);
  const key = await signer();
  const trusted = await keys.trust('Promotion Signing Key', key.publicKey);
  const payload = await provenance.buildSigningPayload(registered.candidate.id, 'MIO Release Engineering');
  const signedEvidence = await provenance.verifyAndBind(
    registered.candidate.id,
    JSON.stringify(await envelope(payload, key.privateKey, trusted.keyId)),
  );

  const review = new TrainingCandidateReviewService(storage);
  const rc = await review.advanceToReleaseCandidate({
    candidateId: registered.candidate.id,
    reviewer: 'release-reviewer',
    dataGovernanceAttested: true,
    securityAttested: true,
  });
  check(rc.manifest.lifecycle === 'RELEASE_CANDIDATE', 'Trusted signed provenance can pass explicit release-candidate review when all other gates pass');

  const promotion = new ModelPromotionService(storage);
  const eligible = await promotion.inspect(registered.manifest.id);
  check(eligible?.promotionEligible === true && eligible.provenanceSignerStatus === 'TRUSTED', 'Final promotion revalidates current signed provenance and trusted signer state');

  await keys.revoke(trusted.keyId);
  const blocked = await promotion.inspect(registered.manifest.id);
  check(
    blocked?.promotionEligible === false
      && blocked.provenanceSignerStatus === 'REVOKED'
      && blocked.blockingReasons.some((reason) => reason.toLowerCase().includes('no longer trusted')),
    'Signer revocation after RELEASE_CANDIDATE blocks final PROMOTED transition',
  );

  let promoteBlocked = false;
  try { await promotion.promote({ manifestId: registered.manifest.id, promoter: 'final-promoter', finalAttestation: true }); }
  catch (error) { promoteBlocked = error instanceof Error && error.message.toLowerCase().includes('no longer trusted'); }
  check(promoteBlocked, 'Explicit final promotion cannot override a revoked provenance signer');

  await keys.trust('Promotion Signing Key re-trusted', key.publicKey);
  const restored = await promotion.inspect(registered.manifest.id);
  check(restored?.promotionEligible === true && restored.provenanceSignerStatus === 'TRUSTED', 'Explicit re-trust restores final-promotion eligibility without rewriting signed evidence');

  const manifests = new ModelManifestRepository(storage);
  check((await manifests.get(registered.manifest.id))?.lifecycle === 'RELEASE_CANDIDATE', 'Trust restoration never promotes or activates the model automatically');
  check((await manifests.getActivePromoted()) === undefined, 'No active promoted-model pointer is created by provenance or trust operations');

  const promoted = await promotion.promote({
    manifestId: registered.manifest.id,
    promoter: 'final-promoter',
    finalAttestation: true,
  });
  check(promoted.manifest.lifecycle === 'PROMOTED', 'Explicit final promotion succeeds after signer trust is restored');
  check(
    promoted.manifest.promotion?.provenanceEvidenceId === signedEvidence.id
      && promoted.provenanceEvidenceId === signedEvidence.id,
    'Promotion manifest binds the exact verified signed-provenance evidence id',
  );

  const postPromotion = await integrity.scanCandidate(registered.candidate.id, port);
  check(postPromotion.evidence?.comparison === 'MATCH', 'Fresh post-promotion adapter scan remains MATCH against immutable baseline');

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
  const activation = new PromotedModelActivationService(
    manifests,
    preferences,
    registry,
    integrity,
    provenance,
    keys,
  );

  const originalFetch = globalThis.fetch;
  let readinessCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    readinessCalls += 1;
    if (String(input) === 'http://127.0.0.1:8000/v1/models') {
      return new Response(JSON.stringify({ data: [{ id: 'mio-signed-promotion:latest' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    await keys.revoke(trusted.keyId);
    let activationBlocked = false;
    try { await activation.activatePromoted(registered.manifest.id, { backend: 'vllm' }); }
    catch (error) { activationBlocked = error instanceof Error && error.message.toLowerCase().includes('no longer trusted'); }
    check(activationBlocked, 'Signer revocation after PROMOTED blocks runtime activation');
    check(readinessCalls === 0 && router.provider === 'local_heuristic', 'Signed-provenance trust gate runs before readiness calls or ModelRouter mutation');
    check((await manifests.getActivePromoted()) === undefined, 'Blocked activation does not create an active promoted-model pointer');

    await keys.trust('Promotion Signing Key activation re-trust', key.publicKey);
    const activated = await activation.activatePromoted(registered.manifest.id, { backend: 'vllm' });
    check(activated.provenanceEvidenceId === signedEvidence.id, 'Successful activation returns the exact signed-provenance evidence bound at promotion');
    check(activated.integrityEvidenceId === postPromotion.evidence?.id, 'Successful activation also binds the fresh post-promotion integrity evidence');
    check(router.provider === 'mio_local' && router.model === 'mio-signed-promotion:latest', 'Runtime changes only after integrity, provenance trust, and readiness all pass');
    check((await manifests.getActivePromoted())?.id === registered.manifest.id, 'Successful activation persists the promoted active pointer');
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { passed, total };
}
