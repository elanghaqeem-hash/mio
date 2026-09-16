import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import { ModelSignerTrustStore, type ModelSignerTrustStatus } from './SignedModelArtifactProvenance';
import {
  verifyCandidateEvidencePackage,
  type CandidateEvidencePackageVerification,
  type MioCandidateEvidencePackage,
} from './TrainingCandidateEvidencePackage';
import { sha256Hex, stableJsonStringify } from './TrainingBundle';

const MAX_ENVELOPE_CHARS = 20 * 1024 * 1024;
const MAX_PUBLIC_KEY_CHARS = 32 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_KEY_ID = /^p256:[a-f0-9]{64}$/;
const ENVELOPE_KEYS = new Set(['schemaVersion', 'kind', 'package', 'payload', 'signature']);
const PAYLOAD_KEYS = new Set(['schemaVersion', 'kind', 'packageSha256', 'candidateId', 'manifestId', 'lifecycle', 'exportedAt', 'issuer', 'signedAt']);
const SIGNATURE_KEYS = new Set(['algorithm', 'keyId', 'valueBase64']);

export interface MioCandidateEvidenceSignaturePayload {
  schemaVersion: 1;
  kind: 'MIO_CANDIDATE_EVIDENCE_SIGNATURE_V1';
  packageSha256: string;
  candidateId: string;
  manifestId: string;
  lifecycle: MioCandidateEvidencePackage['manifest']['lifecycle'];
  exportedAt: number;
  issuer: string;
  signedAt: number;
}

export interface MioSignedCandidateEvidenceEnvelope {
  schemaVersion: 1;
  kind: 'MIO_SIGNED_CANDIDATE_EVIDENCE_PACKAGE_V1';
  package: MioCandidateEvidencePackage;
  payload: MioCandidateEvidenceSignaturePayload;
  signature: {
    algorithm: 'ECDSA_P256_SHA256';
    keyId: string;
    valueBase64: string;
  };
}

export interface SignedCandidateEvidenceVerification {
  valid: boolean;
  errors: string[];
  packageVerification?: CandidateEvidencePackageVerification;
  signerKeyId?: string;
  signerLabel?: string;
  signerStatus?: ModelSignerTrustStatus;
  payloadSha256?: string;
  envelopeSha256?: string;
}

function parseEnvelope(text: string): MioSignedCandidateEvidenceEnvelope {
  if (!text.trim()) throw new Error('Signed candidate evidence envelope is empty');
  if (text.length > MAX_ENVELOPE_CHARS) throw new Error('Signed candidate evidence envelope exceeds the 20 MiB verification limit');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Signed candidate evidence envelope is invalid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Signed candidate evidence envelope must be a JSON object');
  return parsed as MioSignedCandidateEvidenceEnvelope;
}

function decodeBase64(value: string): Uint8Array {
  const compact = value.replace(/\s+/g, '');
  if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) throw new Error('Candidate evidence signature value is invalid base64');
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
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_PUBLIC_KEY_CHARS) throw new Error('Trusted signer public key is empty or exceeds the bounded input limit');
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
  try {
    return await globalThis.crypto.subtle.importKey(
      'spki',
      ownedArrayBuffer(decodeBase64(spkiBase64)),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    throw new Error('Trusted signer public key must be a valid P-256 SubjectPublicKeyInfo key');
  }
}

async function keyIdForSpki(spkiBase64: string): Promise<string> {
  return `p256:${await sha256BytesHex(decodeBase64(spkiBase64))}`;
}

function exactKeyErrors(value: object, allowed: Set<string>, label: string): string[] {
  return Object.keys(value).filter((key) => !allowed.has(key)).map((key) => `Unknown ${label} field '${key}'`);
}

function payloadBindingErrors(envelope: MioSignedCandidateEvidenceEnvelope): string[] {
  const errors: string[] = [];
  const { payload, package: pkg } = envelope;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['Signed candidate evidence signature payload is missing'];
  errors.push(...exactKeyErrors(payload, PAYLOAD_KEYS, 'candidate evidence signature payload'));
  if (payload.schemaVersion !== 1) errors.push('Unsupported candidate evidence signature payload schema');
  if (payload.kind !== 'MIO_CANDIDATE_EVIDENCE_SIGNATURE_V1') errors.push('Unsupported candidate evidence signature payload kind');
  if (payload.packageSha256 !== pkg?.packageSha256) errors.push('Signature payload package SHA-256 does not match embedded candidate evidence package');
  if (payload.candidateId !== pkg?.candidate?.id) errors.push('Signature payload candidateId does not match embedded package');
  if (payload.manifestId !== pkg?.manifest?.id) errors.push('Signature payload manifestId does not match embedded package');
  if (payload.lifecycle !== pkg?.manifest?.lifecycle) errors.push('Signature payload lifecycle does not match embedded package');
  if (payload.exportedAt !== pkg?.exportedAt) errors.push('Signature payload exportedAt does not match embedded package');
  if (!payload.issuer?.trim() || payload.issuer.length > 200) errors.push('Signature payload issuer is invalid');
  if (!Number.isSafeInteger(payload.signedAt) || payload.signedAt <= 0) errors.push('Signature payload signedAt is invalid');
  if (Number.isSafeInteger(payload.signedAt) && Number.isSafeInteger(pkg?.exportedAt) && payload.signedAt < pkg.exportedAt) errors.push('Signature timestamp predates the candidate evidence package export');
  return errors;
}

export async function buildCandidateEvidenceSignaturePayload(
  pkg: MioCandidateEvidencePackage,
  issuerInput: string,
  signedAt = Date.now(),
): Promise<MioCandidateEvidenceSignaturePayload> {
  const packageVerification = await verifyCandidateEvidencePackage(JSON.stringify(pkg));
  if (!packageVerification.valid) throw new Error(`Candidate evidence package must verify before signing: ${packageVerification.errors.join('; ')}`);
  const issuer = issuerInput.trim().slice(0, 200);
  if (!issuer) throw new Error('Candidate evidence signature issuer is required');
  if (!Number.isSafeInteger(signedAt) || signedAt <= 0 || signedAt < pkg.exportedAt) throw new Error('Candidate evidence signature timestamp is invalid');
  return {
    schemaVersion: 1,
    kind: 'MIO_CANDIDATE_EVIDENCE_SIGNATURE_V1',
    packageSha256: pkg.packageSha256,
    candidateId: pkg.candidate.id,
    manifestId: pkg.manifest.id,
    lifecycle: pkg.manifest.lifecycle,
    exportedAt: pkg.exportedAt,
    issuer,
    signedAt,
  };
}

export class SignedCandidateEvidencePackageService {
  private readonly signers: ModelSignerTrustStore;

  constructor(storage: StorageProvider = defaultStorageProvider) {
    this.signers = new ModelSignerTrustStore(storage);
  }

  public async verify(envelopeJson: string): Promise<SignedCandidateEvidenceVerification> {
    let envelope: MioSignedCandidateEvidenceEnvelope;
    try { envelope = parseEnvelope(envelopeJson); } catch (error) {
      return { valid: false, errors: [error instanceof Error ? error.message : 'Signed candidate evidence envelope could not be parsed'] };
    }

    const errors: string[] = [];
    errors.push(...exactKeyErrors(envelope, ENVELOPE_KEYS, 'signed candidate evidence envelope'));
    if (envelope.schemaVersion !== 1) errors.push('Unsupported signed candidate evidence envelope schema');
    if (envelope.kind !== 'MIO_SIGNED_CANDIDATE_EVIDENCE_PACKAGE_V1') errors.push('Unsupported signed candidate evidence envelope kind');

    const packageVerification = await verifyCandidateEvidencePackage(JSON.stringify(envelope.package));
    if (!packageVerification.valid) errors.push(...packageVerification.errors.map((error) => `Package: ${error}`));
    errors.push(...payloadBindingErrors(envelope));

    if (!envelope.signature || typeof envelope.signature !== 'object' || Array.isArray(envelope.signature)) {
      errors.push('Signed candidate evidence signature is missing');
      return { valid: false, errors: [...new Set(errors)], packageVerification };
    }
    errors.push(...exactKeyErrors(envelope.signature, SIGNATURE_KEYS, 'candidate evidence signature'));
    if (envelope.signature.algorithm !== 'ECDSA_P256_SHA256') errors.push('Candidate evidence signature algorithm must be ECDSA_P256_SHA256');
    if (!SAFE_KEY_ID.test(envelope.signature.keyId ?? '')) errors.push('Candidate evidence signature keyId is malformed');

    let signatureBytes: Uint8Array | undefined;
    try { signatureBytes = decodeBase64(envelope.signature.valueBase64 ?? ''); } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Candidate evidence signature is invalid');
    }

    let signerLabel: string | undefined;
    let signerStatus: ModelSignerTrustStatus | undefined;
    if (SAFE_KEY_ID.test(envelope.signature.keyId ?? '')) {
      try {
        const signer = await this.signers.get(envelope.signature.keyId);
        if (!signer) errors.push('Candidate evidence signer is not present in the MIO trust store');
        else {
          signerLabel = signer.label;
          signerStatus = signer.status;
          if (signer.status !== 'TRUSTED') errors.push('Candidate evidence signer is not currently TRUSTED');
          const normalized = normalizeSpkiPublicKey(signer.publicKeySpkiBase64);
          const computedKeyId = await keyIdForSpki(normalized);
          if (computedKeyId !== signer.keyId || computedKeyId !== envelope.signature.keyId) errors.push('Candidate evidence signer key identity is inconsistent');
          if (signatureBytes && envelope.signature.algorithm === 'ECDSA_P256_SHA256') {
            const key = await importP256PublicKey(normalized);
            const verified = await globalThis.crypto.subtle.verify(
              { name: 'ECDSA', hash: 'SHA-256' },
              key,
              ownedArrayBuffer(signatureBytes),
              new TextEncoder().encode(stableJsonStringify(envelope.payload)),
            );
            if (!verified) errors.push('Candidate evidence signature verification failed');
          }
        }
      } catch (error) {
        errors.push(`Candidate evidence signer verification failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    let payloadSha256: string | undefined;
    let envelopeSha256: string | undefined;
    try {
      payloadSha256 = await sha256Hex(stableJsonStringify(envelope.payload));
      envelopeSha256 = await sha256Hex(stableJsonStringify(envelope));
      if (!SHA256.test(payloadSha256) || !SHA256.test(envelopeSha256)) errors.push('Candidate evidence signature digest computation failed contract validation');
    } catch (error) {
      errors.push(`Signed candidate evidence digest could not be computed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors: [...new Set(errors)],
      packageVerification,
      signerKeyId: envelope.signature.keyId,
      ...(signerLabel ? { signerLabel } : {}),
      ...(signerStatus ? { signerStatus } : {}),
      ...(payloadSha256 ? { payloadSha256 } : {}),
      ...(envelopeSha256 ? { envelopeSha256 } : {}),
    };
  }
}

export const signedCandidateEvidencePackageService = new SignedCandidateEvidencePackageService();
