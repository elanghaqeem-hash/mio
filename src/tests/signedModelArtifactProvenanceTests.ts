import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { ModelProvider } from '../types/models';
import type { AdapterIntegrityHashOutput } from '../platform/desktop/DesktopAdapterIntegrityGateway';
import { buildTrainingBundle, stableJsonStringify, type MioTrainingRunConfig } from '../training/TrainingBundle';
import type { MioTrainingExample } from '../training/TrainingDataset';
import type { MioBenchCase } from '../training/MioBench';
import { TrainingCandidateRegistry, type MioTrainingResultArtifact } from '../training/TrainingCandidateRegistry';
import {
  TrainingCandidateIntegrityService,
  type CandidateIntegrityDesktopPort,
} from '../training/TrainingCandidateIntegrityService';
import {
  ModelSignerTrustStore,
  TrainingCandidateProvenanceService,
  type MioArtifactProvenancePayload,
  type MioSignedArtifactProvenanceEnvelope,
} from '../training/SignedModelArtifactProvenance';
import { TrainingCandidateReviewService } from '../training/TrainingCandidateReviewService';
import { ModelManifestRepository } from '../training/ModelManifestRepository';

interface SuiteResult { passed: number; total: number; }

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function generateSigner(): Promise<{ privateKey: CryptoKey; publicSpkiBase64: string }> {
  const pair = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = await globalThis.crypto.subtle.exportKey('spki', pair.publicKey);
  return { privateKey: pair.privateKey, publicSpkiBase64: toBase64(new Uint8Array(spki)) };
}

async function signEnvelope(
  payload: MioArtifactProvenancePayload,
  privateKey: CryptoKey,
  keyId: string,
): Promise<MioSignedArtifactProvenanceEnvelope> {
  const signature = await globalThis.crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(stableJsonStringify(payload)),
  );
  return {
    schemaVersion: 1,
    payload,
    signature: {
      algorithm: 'ECDSA_P256_SHA256',
      keyId,
      valueBase64: toBase64(new Uint8Array(signature)),
    },
  };
}

function hashOutput(fingerprint: string): AdapterIntegrityHashOutput {
  return {
    schemaVersion: 1,
    algorithm: 'SHA-256',
    canonicalization: 'mio-adapter-tree-v1',
    rootRelativePath: '.',
    fingerprint,
    fileCount: 3,
    totalBytes: 2048,
    limits: { maxFiles: 5000, maxBytes: 4 * 1024 * 1024 * 1024, maxDepth: 24 },
  };
}

const example: MioTrainingExample = {
  schemaVersion: 1,
  id: 'signed-provenance:001',
  domain: 'GENERAL',
  language: 'id',
  messages: [
    { role: 'user', content: 'Apa arti provenance model?' },
    { role: 'assistant', content: 'Provenance mengikat identitas artifact dengan bukti asal yang dapat diverifikasi.' },
  ],
  provenance: { kind: 'CURATED', createdAt: 1, reviewer: 'signed-provenance-test' },
  eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
  quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
};

const config: MioTrainingRunConfig = {
  baseModel: 'Qwen/Qwen3-8B',
  targetModel: 'Mio-Local-8B-signed-provenance',
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

export async function runSignedModelArtifactProvenanceTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`SignedModelArtifactProvenance test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const storage = new InMemoryStorageProvider();
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

  const registry = new TrainingCandidateRegistry(storage);
  const registration = await registry.register({
    bundle: bundle.manifest,
    result,
    runtimeModel: 'mio-signed-provenance:latest',
    artifactUri: 'local-model://mio-signed-provenance/latest',
    benchmarkPolicy: { minPassRate: 1, minScoreRatio: 1, requiredDomains: ['GENERAL'] },
  });

  const benchCase: MioBenchCase = {
    id: 'signed-provenance-general',
    domain: 'GENERAL',
    prompt: 'Apa arti provenance model?',
    requiredPhrases: ['provenance'],
  };
  const provider: ModelProvider = {
    id: 'local_heuristic',
    displayName: 'Signed Provenance Test Provider',
    requiresNetwork: false,
    requiresProxy: false,
    async generate() {
      return {
        provider: 'local_heuristic',
        model: 'mio-signed-provenance:latest',
        text: 'Provenance adalah bukti identitas artifact.',
        generatedAt: Date.now(),
        source: 'LOCAL',
      };
    },
  };
  await registry.evaluate(registration.candidate.id, provider, [benchCase]);

  const integrity = new TrainingCandidateIntegrityService(storage);
  const artifactFingerprint = 'a'.repeat(64);
  const integrityPort: CandidateIntegrityDesktopPort = {
    authorizeDirectory: async () => ({ id: 'ws_signed_provenance', name: 'signed-provenance-adapter' }),
    hashDirectory: async () => hashOutput(artifactFingerprint),
    revokeDirectory: async () => undefined,
  };
  const integrityEvidence = await integrity.scanCandidate(registration.candidate.id, integrityPort);
  check(integrityEvidence.evidence?.comparison === 'BASELINE_CAPTURED', 'Signed provenance requires a candidate-bound TP-0.50 artifact fingerprint baseline');

  const trust = new ModelSignerTrustStore(storage);
  const provenance = new TrainingCandidateProvenanceService(storage);
  const review = new TrainingCandidateReviewService(storage);
  const signer = await generateSigner();
  const trusted = await trust.trust('Release Signing Key A', signer.publicSpkiBase64);
  check(trusted.status === 'TRUSTED' && trusted.keyId.startsWith('p256:'), 'Explicit P-256 public-key import creates a deterministic trusted signer identity');

  const payload = await provenance.buildSigningPayload(registration.candidate.id, 'MIO Release Engineering');
  check(
    payload.candidateId === registration.candidate.id
      && payload.trainingResultSha256 === registration.candidate.trainingResultSha256
      && payload.artifactFingerprint === artifactFingerprint,
    'Signing payload binds candidate, training result, and current adapter fingerprint exactly',
  );

  const envelope = await signEnvelope(payload, signer.privateKey, trusted.keyId);
  const evidence = await provenance.verifyAndBind(registration.candidate.id, JSON.stringify(envelope));
  check(
    evidence.signerKeyId === trusted.keyId
      && evidence.artifactFingerprint === artifactFingerprint
      && /^[a-f0-9]{64}$/.test(evidence.payloadSha256)
      && /^[a-f0-9]{64}$/.test(evidence.envelopeSha256),
    'Trusted P-256 signature verifies and persists exact candidate-bound provenance evidence',
  );

  const manifests = new ModelManifestRepository(storage);
  check((await manifests.get(registration.manifest.id))?.lifecycle === 'EXPERIMENTAL', 'Valid signed provenance never advances candidate lifecycle automatically');
  check((await manifests.getActivePromoted()) === undefined, 'Valid signed provenance never activates a model');

  const eligibleTrusted = await review.inspect(registration.candidate.id);
  check(
    eligibleTrusted?.releaseCandidateEligible === true
      && eligibleTrusted.provenanceSignerStatus === 'TRUSTED',
    'Trusted signed provenance remains compatible with otherwise eligible explicit release review',
  );

  const tamperedPayload: MioArtifactProvenancePayload = { ...payload, issuer: 'Tampered Issuer' };
  const tamperedEnvelope: MioSignedArtifactProvenanceEnvelope = { ...envelope, payload: tamperedPayload };
  let tamperRejected = false;
  try { await provenance.verifyAndBind(registration.candidate.id, JSON.stringify(tamperedEnvelope)); }
  catch (error) { tamperRejected = error instanceof Error && error.message.toLowerCase().includes('signature'); }
  check(tamperRejected, 'Payload tampering is rejected by cryptographic signature verification');

  const fingerprintMismatchPayload: MioArtifactProvenancePayload = { ...payload, artifactFingerprint: 'b'.repeat(64) };
  const fingerprintMismatchEnvelope = await signEnvelope(fingerprintMismatchPayload, signer.privateKey, trusted.keyId);
  let fingerprintMismatchRejected = false;
  try { await provenance.verifyAndBind(registration.candidate.id, JSON.stringify(fingerprintMismatchEnvelope)); }
  catch (error) { fingerprintMismatchRejected = error instanceof Error && error.message.includes('artifactFingerprint'); }
  check(fingerprintMismatchRejected, 'Even a valid trusted signature is rejected when its artifact fingerprint does not match current TP-0.50 evidence');

  const untrustedSigner = await generateSigner();
  const untrustedPayload = await provenance.buildSigningPayload(registration.candidate.id, 'Unknown Signing Authority');
  const tempTrust = new ModelSignerTrustStore(new InMemoryStorageProvider());
  const tempIdentity = await tempTrust.trust('Temporary identity calculator', untrustedSigner.publicSpkiBase64);
  const untrustedEnvelope = await signEnvelope(untrustedPayload, untrustedSigner.privateKey, tempIdentity.keyId);
  let untrustedRejected = false;
  try { await provenance.verifyAndBind(registration.candidate.id, JSON.stringify(untrustedEnvelope)); }
  catch (error) { untrustedRejected = error instanceof Error && error.message.toLowerCase().includes('not currently trusted'); }
  check(untrustedRejected, 'A cryptographically valid signature from a non-trusted key is rejected');

  await trust.revoke(trusted.keyId);
  const blockedAfterRevoke = await review.inspect(registration.candidate.id);
  check(
    blockedAfterRevoke?.releaseCandidateEligible === false
      && blockedAfterRevoke.provenanceSignerStatus === 'REVOKED'
      && blockedAfterRevoke.blockingReasons.some((reason) => reason.toLowerCase().includes('no longer trusted')),
    'Revoking a signer preserves audit evidence but blocks release-candidate review while that provenance is current',
  );

  const retrusted = await trust.trust('Release Signing Key A re-trusted', signer.publicSpkiBase64);
  check(retrusted.keyId === trusted.keyId && retrusted.status === 'TRUSTED', 'Re-trusting the same public key restores the same deterministic key identity');
  const eligibleAgain = await review.inspect(registration.candidate.id);
  check(eligibleAgain?.releaseCandidateEligible === true && eligibleAgain.provenanceSignerStatus === 'TRUSTED', 'Explicit re-trust restores release-review eligibility without rewriting provenance evidence');

  return { passed, total };
}
