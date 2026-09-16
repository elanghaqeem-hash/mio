import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import { sha256Hex, stableJsonStringify } from './TrainingBundle';
import { TrainingCandidateIntegrityService, type CandidateAdapterIntegrityEvidence } from './TrainingCandidateIntegrityService';
import { TrainingCandidateRegistry, type TrainingCandidateRecord } from './TrainingCandidateRegistry';
import { ModelManifestRepository } from './ModelManifestRepository';
import type { MioModelManifest } from './ModelManifest';

const NAMESPACE = 'training' as const;
const SIGNER_INDEX_KEY = 'trusted-model-signer-index-v1';
const PROVENANCE_INDEX_KEY = 'candidate-signed-provenance-index-v1';
const MAX_PROVENANCE_JSON_CHARS = 2 * 1024 * 1024;
const MAX_PUBLIC_KEY_CHARS = 32 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_KEY_ID = /^p256:[a-f0-9]{64}$/;

export type ModelSignerTrustStatus = 'TRUSTED' | 'REVOKED';

export interface TrustedModelSigner {
  schemaVersion: 1;
  keyId: string;
  label: string;
  publicKeySpkiBase64: string;
  status: ModelSignerTrustStatus;
  trustedAt: number;
  revokedAt?: number;
}

export interface MioArtifactProvenancePayload {
  schemaVersion: 1;
  kind: 'MIO_MODEL_ARTIFACT_PROVENANCE_V1';
  candidateId: string;
  manifestId: string;
  bundleId: string;
  trainingResultSha256: string;
  datasetSha256: string;
  configSha256: string;
  runtimeModel: string;
  baseModel: string;
  trainingMethod: 'LORA' | 'QLORA';
  artifactUri: string;
  artifactFingerprint: string;
  artifactCanonicalization: 'mio-adapter-tree-v1';
  fileCount: number;
  totalBytes: number;
  issuer: string;
  issuedAt: number;
}

export interface MioSignedArtifactProvenanceEnvelope {
  schemaVersion: 1;
  payload: MioArtifactProvenancePayload;
  signature: {
    algorithm: 'ECDSA_P256_SHA256';
    keyId: string;
    valueBase64: string;
  };
}

export interface CandidateSignedProvenanceEvidence {
  schemaVersion: 1;
  id: string;
  candidateId: string;
  manifestId: string;
  runtimeModel: string;
  artifactUri: string;
  trainingResultSha256: string;
  artifactFingerprint: string;
  signerKeyId: string;
  signerLabel: string;
  signerTrustedAt: number;
  issuer: string;
  issuedAt: number;
  verifiedAt: number;
  payloadSha256: string;
  envelopeSha256: string;
  signatureAlgorithm: 'ECDSA_P256_SHA256';
  disclosure: string;
}

function decodeBase64(value: string): Uint8Array {
  const compact = value.replace(/\s+/g, '');
  if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) throw new Error('Base64 value is invalid');
  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function normalizeSpkiPublicKey(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_PUBLIC_KEY_CHARS) throw new Error('Model signer public key is empty or exceeds the bounded input limit');
  return value
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
}

async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable in this runtime');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', ownedArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function importP256PublicKey(spkiBase64: string): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable in this runtime');
  const bytes = decodeBase64(spkiBase64);
  try {
    return await globalThis.crypto.subtle.importKey(
      'spki',
      ownedArrayBuffer(bytes),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    throw new Error('Model signer public key must be a valid P-256 SubjectPublicKeyInfo key');
  }
}

async function keyIdForSpki(spkiBase64: string): Promise<string> {
  return `p256:${await sha256BytesHex(decodeBase64(spkiBase64))}`;
}

function boundedLabel(value: string): string {
  const label = value.trim().slice(0, 200);
  if (!label) throw new Error('Trusted signer label is required');
  return label;
}

function payloadShapeErrors(payload: MioArtifactProvenancePayload): string[] {
  const errors: string[] = [];
  if (payload.schemaVersion !== 1) errors.push('Unsupported provenance payload schema');
  if (payload.kind !== 'MIO_MODEL_ARTIFACT_PROVENANCE_V1') errors.push('Unsupported provenance payload kind');
  const bounded = [
    ['candidateId', payload.candidateId, 512],
    ['manifestId', payload.manifestId, 512],
    ['bundleId', payload.bundleId, 512],
    ['runtimeModel', payload.runtimeModel, 256],
    ['baseModel', payload.baseModel, 256],
    ['artifactUri', payload.artifactUri, 1024],
    ['issuer', payload.issuer, 200],
  ] as const;
  for (const [name, value, max] of bounded) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) errors.push(`Provenance field '${name}' is invalid`);
  }
  for (const [name, value] of [
    ['trainingResultSha256', payload.trainingResultSha256],
    ['datasetSha256', payload.datasetSha256],
    ['configSha256', payload.configSha256],
    ['artifactFingerprint', payload.artifactFingerprint],
  ] as const) {
    if (!SHA256.test(value)) errors.push(`Provenance field '${name}' must be SHA-256 hex`);
  }
  if (payload.trainingMethod !== 'LORA' && payload.trainingMethod !== 'QLORA') errors.push('Provenance trainingMethod is invalid');
  if (payload.artifactCanonicalization !== 'mio-adapter-tree-v1') errors.push('Provenance artifact canonicalization is invalid');
  if (!Number.isSafeInteger(payload.fileCount) || payload.fileCount < 1) errors.push('Provenance fileCount is invalid');
  if (!Number.isSafeInteger(payload.totalBytes) || payload.totalBytes < 0) errors.push('Provenance totalBytes is invalid');
  if (!Number.isSafeInteger(payload.issuedAt) || payload.issuedAt <= 0 || payload.issuedAt > Date.now() + 5 * 60_000) errors.push('Provenance issuedAt is invalid or too far in the future');
  return errors;
}

function parseEnvelope(text: string): MioSignedArtifactProvenanceEnvelope {
  if (!text.trim()) throw new Error('Signed provenance file is empty');
  if (text.length > MAX_PROVENANCE_JSON_CHARS) throw new Error('Signed provenance file exceeds the 2 MiB import limit');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Signed provenance file is invalid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Signed provenance envelope must be a JSON object');
  const envelope = parsed as MioSignedArtifactProvenanceEnvelope;
  if (envelope.schemaVersion !== 1) throw new Error('Unsupported signed provenance envelope schema');
  if (!envelope.payload || typeof envelope.payload !== 'object') throw new Error('Signed provenance payload is missing');
  if (!envelope.signature || typeof envelope.signature !== 'object') throw new Error('Signed provenance signature is missing');
  if (envelope.signature.algorithm !== 'ECDSA_P256_SHA256') throw new Error('Signed provenance algorithm must be ECDSA_P256_SHA256');
  if (!SAFE_KEY_ID.test(envelope.signature.keyId)) throw new Error('Signed provenance keyId is invalid');
  const signature = decodeBase64(envelope.signature.valueBase64);
  if (signature.byteLength !== 64) throw new Error('P-256 provenance signature must use 64-byte IEEE-P1363 encoding');
  const errors = payloadShapeErrors(envelope.payload);
  if (errors.length) throw new Error(`Signed provenance payload is invalid: ${errors.join('; ')}`);
  return envelope;
}

function assertIntegrityBinding(
  candidate: TrainingCandidateRecord,
  manifest: MioModelManifest,
  integrity: CandidateAdapterIntegrityEvidence,
): void {
  if (integrity.comparison === 'DRIFT') throw new Error('Signed provenance cannot be prepared or accepted while adapter integrity reports DRIFT');
  if (integrity.candidateId !== candidate.id || integrity.manifestId !== manifest.id) throw new Error('Adapter integrity evidence is not bound to the current candidate manifest');
  if (integrity.runtimeModel !== manifest.runtimeModel) throw new Error('Adapter integrity runtime model does not match current manifest');
  if (integrity.artifactUri !== candidate.artifactUri) throw new Error('Adapter integrity artifact URI does not match current candidate');
  if (integrity.trainingResultSha256 !== candidate.trainingResultSha256) throw new Error('Adapter integrity training-result SHA-256 does not match current candidate');
}

export class ModelSignerTrustStore {
  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {}

  public async trust(labelInput: string, publicKeyPemOrBase64: string): Promise<TrustedModelSigner> {
    const label = boundedLabel(labelInput);
    const publicKeySpkiBase64 = normalizeSpkiPublicKey(publicKeyPemOrBase64);
    await importP256PublicKey(publicKeySpkiBase64);
    const keyId = await keyIdForSpki(publicKeySpkiBase64);
    const signer: TrustedModelSigner = {
      schemaVersion: 1,
      keyId,
      label,
      publicKeySpkiBase64,
      status: 'TRUSTED',
      trustedAt: Date.now(),
    };
    await this.storage.set(NAMESPACE, this.key(keyId), signer);
    const index = await this.storage.get<string[]>(NAMESPACE, SIGNER_INDEX_KEY) ?? [];
    await this.storage.set(NAMESPACE, SIGNER_INDEX_KEY, [keyId, ...index.filter((item) => item !== keyId)].slice(0, 500));
    return structuredClone(signer);
  }

  public async revoke(keyId: string): Promise<TrustedModelSigner> {
    const signer = await this.get(keyId);
    if (!signer) throw new Error(`Trusted model signer '${keyId}' was not found`);
    const revoked: TrustedModelSigner = { ...signer, status: 'REVOKED', revokedAt: Date.now() };
    await this.storage.set(NAMESPACE, this.key(keyId), revoked);
    return structuredClone(revoked);
  }

  public async get(keyId: string): Promise<TrustedModelSigner | undefined> {
    if (!SAFE_KEY_ID.test(keyId)) return undefined;
    const value = await this.storage.get<TrustedModelSigner>(NAMESPACE, this.key(keyId));
    return value ? structuredClone(value) : undefined;
  }

  public async list(limit = 100): Promise<TrustedModelSigner[]> {
    const index = await this.storage.get<string[]>(NAMESPACE, SIGNER_INDEX_KEY) ?? [];
    const output: TrustedModelSigner[] = [];
    for (const keyId of index.slice(0, Math.max(1, Math.min(limit, 500)))) {
      const signer = await this.get(keyId);
      if (signer) output.push(signer);
    }
    return output;
  }

  private key(keyId: string): string { return `trusted-model-signer:${keyId}`; }
}

export class TrainingCandidateProvenanceService {
  private readonly candidates: TrainingCandidateRegistry;
  private readonly manifests: ModelManifestRepository;
  private readonly integrity: TrainingCandidateIntegrityService;
  private readonly signers: ModelSignerTrustStore;

  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {
    this.candidates = new TrainingCandidateRegistry(storage);
    this.manifests = new ModelManifestRepository(storage);
    this.integrity = new TrainingCandidateIntegrityService(storage);
    this.signers = new ModelSignerTrustStore(storage);
  }

  public async buildSigningPayload(candidateId: string, issuerInput: string, issuedAt = Date.now()): Promise<MioArtifactProvenancePayload> {
    const issuer = issuerInput.trim().slice(0, 200);
    if (!issuer) throw new Error('Provenance issuer is required');
    const candidate = await this.candidates.get(candidateId);
    if (!candidate) throw new Error(`Training candidate '${candidateId}' is not registered`);
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) throw new Error(`Model manifest '${candidate.manifestId}' is missing`);
    if (manifest.trainingMethod !== 'LORA' && manifest.trainingMethod !== 'QLORA') {
      throw new Error(`Signed training provenance requires LORA or QLORA candidate, found ${manifest.trainingMethod}`);
    }
    const integrity = await this.integrity.latest(candidate.id);
    if (!integrity) throw new Error('A current adapter byte-integrity scan is required before preparing signed provenance');
    assertIntegrityBinding(candidate, manifest, integrity);

    const payload: MioArtifactProvenancePayload = {
      schemaVersion: 1,
      kind: 'MIO_MODEL_ARTIFACT_PROVENANCE_V1',
      candidateId: candidate.id,
      manifestId: manifest.id,
      bundleId: candidate.bundleId,
      trainingResultSha256: candidate.trainingResultSha256,
      datasetSha256: candidate.datasetSha256,
      configSha256: candidate.configSha256,
      runtimeModel: manifest.runtimeModel,
      baseModel: manifest.baseModel,
      trainingMethod: manifest.trainingMethod,
      artifactUri: candidate.artifactUri,
      artifactFingerprint: integrity.fingerprint,
      artifactCanonicalization: integrity.canonicalization,
      fileCount: integrity.fileCount,
      totalBytes: integrity.totalBytes,
      issuer,
      issuedAt,
    };
    const errors = payloadShapeErrors(payload);
    if (errors.length) throw new Error(`Signing payload is invalid: ${errors.join('; ')}`);
    return payload;
  }

  public async verifyAndBind(candidateId: string, envelopeJson: string): Promise<CandidateSignedProvenanceEvidence> {
    const envelope = parseEnvelope(envelopeJson);
    const candidate = await this.candidates.get(candidateId);
    if (!candidate) throw new Error(`Training candidate '${candidateId}' is not registered`);
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) throw new Error(`Model manifest '${candidate.manifestId}' is missing`);
    const integrity = await this.integrity.latest(candidate.id);
    if (!integrity) throw new Error('Current adapter byte-integrity evidence is required before signed provenance verification');
    assertIntegrityBinding(candidate, manifest, integrity);

    const signer = await this.signers.get(envelope.signature.keyId);
    if (!signer || signer.status !== 'TRUSTED') throw new Error('Signed provenance key is not currently trusted by Mio');
    const computedKeyId = await keyIdForSpki(signer.publicKeySpkiBase64);
    if (computedKeyId !== signer.keyId || computedKeyId !== envelope.signature.keyId) throw new Error('Trusted signer key identity is inconsistent');

    const payload = envelope.payload;
    const bindingErrors: string[] = [];
    if (payload.candidateId !== candidate.id) bindingErrors.push('candidateId');
    if (payload.manifestId !== manifest.id) bindingErrors.push('manifestId');
    if (payload.bundleId !== candidate.bundleId) bindingErrors.push('bundleId');
    if (payload.trainingResultSha256 !== candidate.trainingResultSha256) bindingErrors.push('trainingResultSha256');
    if (payload.datasetSha256 !== candidate.datasetSha256) bindingErrors.push('datasetSha256');
    if (payload.configSha256 !== candidate.configSha256) bindingErrors.push('configSha256');
    if (payload.runtimeModel !== manifest.runtimeModel) bindingErrors.push('runtimeModel');
    if (payload.baseModel !== manifest.baseModel) bindingErrors.push('baseModel');
    if (payload.trainingMethod !== manifest.trainingMethod) bindingErrors.push('trainingMethod');
    if (payload.artifactUri !== candidate.artifactUri) bindingErrors.push('artifactUri');
    if (payload.artifactFingerprint !== integrity.fingerprint) bindingErrors.push('artifactFingerprint');
    if (payload.artifactCanonicalization !== integrity.canonicalization) bindingErrors.push('artifactCanonicalization');
    if (payload.fileCount !== integrity.fileCount) bindingErrors.push('fileCount');
    if (payload.totalBytes !== integrity.totalBytes) bindingErrors.push('totalBytes');
    if (bindingErrors.length) throw new Error(`Signed provenance does not match current candidate/artifact identity: ${bindingErrors.join(', ')}`);

    const key = await importP256PublicKey(signer.publicKeySpkiBase64);
    const signature = decodeBase64(envelope.signature.valueBase64);
    const canonicalPayload = stableJsonStringify(payload);
    const verified = await globalThis.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      ownedArrayBuffer(signature),
      new TextEncoder().encode(canonicalPayload),
    );
    if (!verified) throw new Error('Signed provenance signature verification failed');

    const verifiedAt = Date.now();
    const payloadSha256 = await sha256Hex(canonicalPayload);
    const envelopeSha256 = await sha256Hex(stableJsonStringify(envelope));
    const evidence: CandidateSignedProvenanceEvidence = {
      schemaVersion: 1,
      id: `signed-provenance:${candidate.id}:${verifiedAt}:${envelopeSha256.slice(0, 12)}`,
      candidateId: candidate.id,
      manifestId: manifest.id,
      runtimeModel: manifest.runtimeModel,
      artifactUri: candidate.artifactUri,
      trainingResultSha256: candidate.trainingResultSha256,
      artifactFingerprint: integrity.fingerprint,
      signerKeyId: signer.keyId,
      signerLabel: signer.label,
      signerTrustedAt: signer.trustedAt,
      issuer: payload.issuer,
      issuedAt: payload.issuedAt,
      verifiedAt,
      payloadSha256,
      envelopeSha256,
      signatureAlgorithm: 'ECDSA_P256_SHA256',
      disclosure: 'Signature verification proves that the trusted private-key holder signed this exact candidate/artifact identity payload. It does not prove model quality, factual correctness, safety, or promotion readiness, and it never promotes or activates a model.',
    };
    await this.save(evidence);
    return structuredClone(evidence);
  }

  public async latest(candidateId: string): Promise<CandidateSignedProvenanceEvidence | undefined> {
    const list = await this.list(candidateId, 1);
    return list[0];
  }

  public async list(candidateId: string, limit = 20): Promise<CandidateSignedProvenanceEvidence[]> {
    const index = await this.storage.get<string[]>(NAMESPACE, PROVENANCE_INDEX_KEY) ?? [];
    const output: CandidateSignedProvenanceEvidence[] = [];
    for (const id of index) {
      const item = await this.storage.get<CandidateSignedProvenanceEvidence>(NAMESPACE, id);
      if (item?.candidateId === candidateId) output.push(structuredClone(item));
      if (output.length >= Math.max(1, Math.min(limit, 500))) break;
    }
    return output;
  }

  private async save(evidence: CandidateSignedProvenanceEvidence): Promise<void> {
    await this.storage.set(NAMESPACE, evidence.id, structuredClone(evidence));
    const index = await this.storage.get<string[]>(NAMESPACE, PROVENANCE_INDEX_KEY) ?? [];
    await this.storage.set(NAMESPACE, PROVENANCE_INDEX_KEY, [evidence.id, ...index.filter((id) => id !== evidence.id)].slice(0, 2_000));
  }
}

export const modelSignerTrustStore = new ModelSignerTrustStore();
export const trainingCandidateProvenanceService = new TrainingCandidateProvenanceService();
