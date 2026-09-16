import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { ModelManifestRepository } from '../training/ModelManifestRepository';
import {
  ModelSignerTrustStore,
} from '../training/SignedModelArtifactProvenance';
import {
  buildCandidateEvidenceSignaturePayload,
  SignedCandidateEvidencePackageService,
  type MioSignedCandidateEvidenceEnvelope,
} from '../training/SignedCandidateEvidencePackage';
import { TrainingCandidateEvidencePackageService } from '../training/TrainingCandidateEvidencePackage';
import { buildTrainingBundle, stableJsonStringify, type MioTrainingRunConfig } from '../training/TrainingBundle';
import type { MioTrainingExample } from '../training/TrainingDataset';
import type { MioTrainingResultArtifact } from '../training/TrainingCandidateRegistry';
import { buildTrainingRunHandoff } from '../training/TrainingRunHandoff';
import { TrainingRunHandoffService } from '../training/TrainingRunHandoffService';

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
  pkg: Awaited<ReturnType<TrainingCandidateEvidencePackageService['export']>>,
  privateKey: CryptoKey,
  keyId: string,
  signedAt: number,
): Promise<MioSignedCandidateEvidenceEnvelope> {
  const payload = await buildCandidateEvidenceSignaturePayload(pkg, 'MIO Candidate Evidence Test Authority', signedAt);
  const signature = await globalThis.crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(stableJsonStringify(payload)),
  );
  return {
    schemaVersion: 1,
    kind: 'MIO_SIGNED_CANDIDATE_EVIDENCE_PACKAGE_V1',
    package: pkg,
    payload,
    signature: {
      algorithm: 'ECDSA_P256_SHA256',
      keyId,
      valueBase64: toBase64(new Uint8Array(signature)),
    },
  };
}

export async function runSignedCandidateEvidencePackageTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`SignedCandidateEvidencePackage test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const privateQuestion = 'PRIVATE_SIGNED_PACKAGE_TRAINING_QUESTION';
  const privateAnswer = 'PRIVATE_SIGNED_PACKAGE_TRAINING_ANSWER';
  const example: MioTrainingExample = {
    schemaVersion: 1,
    id: 'signed-candidate-evidence:001',
    domain: 'GENERAL',
    language: 'id',
    messages: [
      { role: 'user', content: privateQuestion },
      { role: 'assistant', content: privateAnswer },
    ],
    provenance: { kind: 'CURATED', createdAt: 1, reviewer: 'signed-candidate-evidence-test' },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  };
  const config: MioTrainingRunConfig = {
    baseModel: 'Qwen/Qwen3-8B',
    targetModel: 'Mio-Local-8B-signed-candidate-evidence',
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
    runtimeModel: 'mio-signed-candidate-evidence:latest',
    artifactUri: 'local-model://mio-signed-candidate-evidence/latest',
  });
  const pkg = await new TrainingCandidateEvidencePackageService(storage).export(registration.candidate.id, 4_000);
  const packageJson = JSON.stringify(pkg);
  check(!packageJson.includes(privateQuestion) && !packageJson.includes(privateAnswer), 'TP-0.61 embeds the privacy-minimized TP-0.60 package without training message content');

  const signer = await generateSigner();
  const trust = new ModelSignerTrustStore(storage);
  const trusted = await trust.trust('Candidate Evidence Signing Key', signer.publicSpkiBase64);
  const envelope = await signEnvelope(pkg, signer.privateKey, trusted.keyId, 5_000);
  const service = new SignedCandidateEvidencePackageService(storage);
  const verified = await service.verify(JSON.stringify(envelope));
  check(
    verified.valid
      && verified.signerKeyId === trusted.keyId
      && verified.signerStatus === 'TRUSTED'
      && verified.packageVerification?.packageSha256 === pkg.packageSha256
      && /^[a-f0-9]{64}$/.test(verified.payloadSha256 ?? '')
      && /^[a-f0-9]{64}$/.test(verified.envelopeSha256 ?? ''),
    'Trusted P-256 signature verifies the exact TP-0.60 package identity and payload',
  );

  const tamperedPackage = structuredClone(envelope);
  tamperedPackage.package.candidate.bundleId = 'mio-train-tampered-after-signing';
  const packageTamperResult = await service.verify(JSON.stringify(tamperedPackage));
  check(!packageTamperResult.valid && packageTamperResult.errors.some((error) => error.startsWith('Package:')), 'Embedded TP-0.60 package tampering is rejected before signature trust can imply validity');

  const tamperedPayload = structuredClone(envelope);
  tamperedPayload.payload.issuer = 'Tampered Candidate Evidence Authority';
  const payloadTamperResult = await service.verify(JSON.stringify(tamperedPayload));
  check(!payloadTamperResult.valid && payloadTamperResult.errors.some((error) => error.toLowerCase().includes('signature verification failed')), 'Signed payload tampering is rejected cryptographically');

  const wrongSigner = await generateSigner();
  const wrongTrustStorage = new InMemoryStorageProvider();
  const wrongIdentity = await new ModelSignerTrustStore(wrongTrustStorage).trust('Wrong Identity Calculator', wrongSigner.publicSpkiBase64);
  const wrongKeyEnvelope = structuredClone(envelope);
  wrongKeyEnvelope.signature.keyId = wrongIdentity.keyId;
  const wrongKeyResult = await service.verify(JSON.stringify(wrongKeyEnvelope));
  check(!wrongKeyResult.valid && wrongKeyResult.errors.some((error) => error.toLowerCase().includes('not present in the mio trust store')), 'Envelope key identity must exist in the current MIO signer trust store');

  await trust.revoke(trusted.keyId, 'signed-candidate-evidence-test', 'test revocation');
  const revokedResult = await service.verify(JSON.stringify(envelope));
  check(!revokedResult.valid && revokedResult.signerStatus === 'REVOKED' && revokedResult.errors.some((error) => error.includes('not currently TRUSTED')), 'Current signer revocation invalidates trusted-envelope verification without rewriting the package');

  const retrusted = await trust.trust('Candidate Evidence Signing Key re-trusted', signer.publicSpkiBase64, 'signed-candidate-evidence-test');
  const retrustedResult = await service.verify(JSON.stringify(envelope));
  check(retrusted.keyId === trusted.keyId && retrustedResult.valid && retrustedResult.signerStatus === 'TRUSTED', 'Explicit re-trust restores verification for the same deterministic signer key identity');

  const unknownField = structuredClone(envelope) as MioSignedCandidateEvidenceEnvelope & { unexpected?: string };
  unknownField.unexpected = 'not signed schema';
  const unknownResult = await service.verify(JSON.stringify(unknownField));
  check(!unknownResult.valid && unknownResult.errors.some((error) => error.includes('Unknown signed candidate evidence envelope field')), 'Unknown envelope fields fail closed instead of riding alongside a valid signature');

  const manifests = new ModelManifestRepository(storage);
  check((await manifests.get(registration.candidate.manifestId))?.lifecycle === 'EXPERIMENTAL', 'Signed package verification never advances the model lifecycle');
  check((await manifests.getActivePromoted()) === undefined, 'Signed package verification never creates an active promoted-model pointer');

  return { passed, total };
}
