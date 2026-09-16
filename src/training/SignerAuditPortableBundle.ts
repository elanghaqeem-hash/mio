import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import { sha256Hex, stableJsonStringify } from './TrainingBundle';
import {
  ModelSignerTrustStore,
  type ModelSignerAuditVerification,
  type ModelSignerTrustEvent,
  type TrustedModelSigner,
} from './SignedModelArtifactProvenance';

const NAMESPACE = 'training' as const;
const SIGNER_INDEX_KEY = 'trusted-model-signer-index-v1';
const SIGNER_AUDIT_INDEX_KEY = 'trusted-model-signer-audit-index-v1';
const MAX_SIGNERS = 500;
const MAX_EVENTS = 10_000;
const MAX_BUNDLE_JSON_CHARS = 16 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_KEY_ID = /^p256:[a-f0-9]{64}$/;

export type PortableSignerAuditState = 'EMPTY' | 'VALID' | 'LEGACY_UNCHAINED' | 'CORRUPT';

export interface PortableSignerRecord {
  schemaVersion: 1;
  keyId: string;
  label: string;
  publicKeySpkiBase64: string;
  status: 'TRUSTED' | 'REVOKED';
  trustedAt: number;
  revokedAt?: number;
}

export interface MioSignerAuditPortableBundleBody {
  schemaVersion: 1;
  kind: 'MIO_SIGNER_TRUST_AUDIT_BUNDLE_V1';
  exportedAt: number;
  sourceVerification: ModelSignerAuditVerification;
  signers: PortableSignerRecord[];
  events: ModelSignerTrustEvent[];
}

export interface MioSignerAuditPortableBundle extends MioSignerAuditPortableBundleBody {
  bundleSha256: string;
}

export interface PortableSignerAuditVerification {
  schemaVersion: 1;
  state: PortableSignerAuditState;
  checkedEvents: number;
  checkedSigners: number;
  bundleSha256?: string;
  latestEventHash?: string;
  reasons: string[];
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

async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable in this runtime');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', ownedArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function auditEventHashMaterial(event: ModelSignerTrustEvent): object {
  return {
    schemaVersion: event.schemaVersion,
    sequence: event.sequence,
    action: event.action,
    keyId: event.keyId,
    label: event.label,
    actor: event.actor,
    ...(event.reason ? { reason: event.reason } : {}),
    ...(event.rotationId ? { rotationId: event.rotationId } : {}),
    ...(event.previousStatus ? { previousStatus: event.previousStatus } : {}),
    resultingStatus: event.resultingStatus,
    occurredAt: event.occurredAt,
    ...(event.previousEventHash ? { previousEventHash: event.previousEventHash } : {}),
  };
}

async function computeAuditEventHash(event: ModelSignerTrustEvent): Promise<string> {
  return sha256Hex(stableJsonStringify(auditEventHashMaterial(event)));
}

function bundleBody(bundle: MioSignerAuditPortableBundle): MioSignerAuditPortableBundleBody {
  return {
    schemaVersion: bundle.schemaVersion,
    kind: bundle.kind,
    exportedAt: bundle.exportedAt,
    sourceVerification: bundle.sourceVerification,
    signers: bundle.signers,
    events: bundle.events,
  };
}

function parseBundle(input: string | MioSignerAuditPortableBundle): MioSignerAuditPortableBundle {
  if (typeof input !== 'string') return structuredClone(input);
  if (!input.trim()) throw new Error('Signer audit verification bundle is empty');
  if (input.length > MAX_BUNDLE_JSON_CHARS) throw new Error('Signer audit verification bundle exceeds the 16 MiB import limit');
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { throw new Error('Signer audit verification bundle is invalid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Signer audit verification bundle must be a JSON object');
  return parsed as MioSignerAuditPortableBundle;
}

export async function verifyPortableSignerAuditBundle(
  input: string | MioSignerAuditPortableBundle,
): Promise<PortableSignerAuditVerification> {
  const reasons: string[] = [];
  let bundle: MioSignerAuditPortableBundle;
  try {
    bundle = parseBundle(input);
  } catch (error) {
    return {
      schemaVersion: 1,
      state: 'CORRUPT',
      checkedEvents: 0,
      checkedSigners: 0,
      reasons: [error instanceof Error ? error.message : 'Signer audit verification bundle could not be parsed'],
    };
  }

  if (bundle.schemaVersion !== 1) reasons.push('Unsupported portable signer-audit bundle schema');
  if (bundle.kind !== 'MIO_SIGNER_TRUST_AUDIT_BUNDLE_V1') reasons.push('Unsupported portable signer-audit bundle kind');
  if (!Number.isSafeInteger(bundle.exportedAt) || bundle.exportedAt <= 0) reasons.push('Portable signer-audit exportedAt is invalid');
  if (!Array.isArray(bundle.signers)) reasons.push('Portable signer-audit signers must be an array');
  if (!Array.isArray(bundle.events)) reasons.push('Portable signer-audit events must be an array');
  if (!SHA256.test(bundle.bundleSha256 ?? '')) reasons.push('Portable signer-audit bundleSha256 is malformed');

  const signers = Array.isArray(bundle.signers) ? bundle.signers : [];
  const events = Array.isArray(bundle.events) ? bundle.events : [];
  if (signers.length > MAX_SIGNERS) reasons.push(`Portable signer-audit signer count exceeds ${MAX_SIGNERS}`);
  if (events.length > MAX_EVENTS) reasons.push(`Portable signer-audit event count exceeds ${MAX_EVENTS}`);

  if (SHA256.test(bundle.bundleSha256 ?? '')) {
    const computedBundleHash = await sha256Hex(stableJsonStringify(bundleBody(bundle)));
    if (computedBundleHash !== bundle.bundleSha256) reasons.push('Portable signer-audit bundle digest mismatch');
  }

  const signerMap = new Map<string, PortableSignerRecord>();
  for (const signer of signers) {
    if (signer.schemaVersion !== 1) reasons.push(`Signer '${signer.keyId ?? 'unknown'}' has unsupported schema`);
    if (!SAFE_KEY_ID.test(signer.keyId ?? '')) reasons.push(`Signer '${signer.keyId ?? 'unknown'}' has invalid keyId`);
    if (!signer.label?.trim()) reasons.push(`Signer '${signer.keyId ?? 'unknown'}' is missing label`);
    if (signer.status !== 'TRUSTED' && signer.status !== 'REVOKED') reasons.push(`Signer '${signer.keyId ?? 'unknown'}' has invalid status`);
    if (!Number.isSafeInteger(signer.trustedAt) || signer.trustedAt <= 0) reasons.push(`Signer '${signer.keyId ?? 'unknown'}' trustedAt is invalid`);
    if (signerMap.has(signer.keyId)) reasons.push(`Duplicate signer '${signer.keyId}' in portable bundle`);
    signerMap.set(signer.keyId, signer);
    try {
      const computedKeyId = `p256:${await sha256BytesHex(decodeBase64(signer.publicKeySpkiBase64 ?? ''))}`;
      if (computedKeyId !== signer.keyId) reasons.push(`Signer '${signer.keyId}' public key does not match its keyId`);
    } catch {
      reasons.push(`Signer '${signer.keyId ?? 'unknown'}' public key is invalid base64 SPKI data`);
    }
  }

  let legacy = false;
  let previousComputedHash: string | undefined;
  const latestByKey = new Map<string, ModelSignerTrustEvent>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const expectedSequence = index + 1;
    if (event.schemaVersion !== 1) reasons.push(`Audit event at sequence ${expectedSequence} has unsupported schema`);
    if (event.sequence !== expectedSequence) reasons.push(`Audit event '${event.id}' sequence ${event.sequence} does not match expected ${expectedSequence}`);
    if (!SAFE_KEY_ID.test(event.keyId ?? '')) reasons.push(`Audit event '${event.id}' has invalid signer key ID`);
    if (!event.label?.trim() || !event.actor?.trim()) reasons.push(`Audit event '${event.id}' is missing label or actor identity`);
    if (event.action !== 'TRUST' && event.action !== 'RETRUST' && event.action !== 'REVOKE') reasons.push(`Audit event '${event.id}' has invalid action`);
    if (event.resultingStatus !== 'TRUSTED' && event.resultingStatus !== 'REVOKED') reasons.push(`Audit event '${event.id}' has invalid resulting status`);
    if (!Number.isSafeInteger(event.occurredAt) || event.occurredAt <= 0) reasons.push(`Audit event '${event.id}' has invalid timestamp`);

    const computedHash = await computeAuditEventHash(event);
    if (!event.eventHash) {
      legacy = true;
    } else {
      if (!SHA256.test(event.eventHash)) reasons.push(`Audit event '${event.id}' eventHash is malformed`);
      if (event.eventHash !== computedHash) reasons.push(`Audit event '${event.id}' hash mismatch`);
      const expectedId = `signer-trust-event:${event.sequence}:${computedHash.slice(0, 20)}`;
      if (event.id !== expectedId) reasons.push(`Audit event '${event.id}' does not match its computed hash identity`);
    }

    if (previousComputedHash) {
      if (!event.previousEventHash) legacy = true;
      else if (event.previousEventHash !== previousComputedHash) reasons.push(`Audit event '${event.id}' previousEventHash does not match its predecessor`);
    } else if (event.previousEventHash) {
      reasons.push(`First audit event '${event.id}' unexpectedly references a predecessor`);
    }
    previousComputedHash = computedHash;
    latestByKey.set(event.keyId, event);
  }

  for (const [keyId, latest] of latestByKey) {
    const signer = signerMap.get(keyId);
    if (!signer) {
      reasons.push(`Signer '${keyId}' has audit history but is absent from portable signer records`);
      continue;
    }
    if (signer.status !== latest.resultingStatus) reasons.push(`Signer '${keyId}' state does not match latest audit status`);
    if (signer.label !== latest.label) reasons.push(`Signer '${keyId}' label does not match latest audit event`);
  }
  for (const signer of signers) {
    if (!latestByKey.has(signer.keyId)) reasons.push(`Signer '${signer.keyId}' has no audit history in portable bundle`);
  }

  const source = bundle.sourceVerification;
  if (!source || source.schemaVersion !== 1) reasons.push('Portable signer-audit source verification snapshot is missing or invalid');
  else {
    if (source.checkedEvents !== events.length) reasons.push('Source verification event count does not match portable events');
    if (source.latestEventHash && source.latestEventHash !== previousComputedHash) reasons.push('Source verification latest event hash does not match portable events');
    if (source.state === 'CORRUPT') reasons.push('Bundle was exported from a CORRUPT source audit state');
  }

  return {
    schemaVersion: 1,
    state: reasons.length > 0 ? 'CORRUPT' : events.length === 0 ? 'EMPTY' : legacy ? 'LEGACY_UNCHAINED' : 'VALID',
    checkedEvents: events.length,
    checkedSigners: signers.length,
    ...(SHA256.test(bundle.bundleSha256 ?? '') ? { bundleSha256: bundle.bundleSha256 } : {}),
    ...(previousComputedHash ? { latestEventHash: previousComputedHash } : {}),
    reasons: [...new Set(reasons)],
  };
}

export class SignerAuditPortableBundleService {
  private readonly trustStore: ModelSignerTrustStore;

  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {
    this.trustStore = new ModelSignerTrustStore(storage);
  }

  public async exportBundle(exportedAt = Date.now()): Promise<MioSignerAuditPortableBundle> {
    if (!Number.isSafeInteger(exportedAt) || exportedAt <= 0) throw new Error('Portable signer-audit exportedAt must be a positive integer timestamp');
    const verification = await this.trustStore.verifyAuditChain();
    if (verification.state === 'CORRUPT') {
      throw new Error(`Portable signer-audit export blocked: ${verification.reasons.join('; ')}`);
    }

    const signerIndex = await this.storage.get<string[]>(NAMESPACE, SIGNER_INDEX_KEY) ?? [];
    const auditIndex = await this.storage.get<string[]>(NAMESPACE, SIGNER_AUDIT_INDEX_KEY) ?? [];
    if (signerIndex.length > MAX_SIGNERS) throw new Error(`Portable signer-audit signer count exceeds ${MAX_SIGNERS}`);
    if (auditIndex.length > MAX_EVENTS) throw new Error(`Portable signer-audit event count exceeds ${MAX_EVENTS}`);

    const signers: PortableSignerRecord[] = [];
    for (const keyId of signerIndex) {
      const signer = await this.storage.get<TrustedModelSigner>(NAMESPACE, `trusted-model-signer:${keyId}`);
      if (!signer) throw new Error(`Portable signer-audit export found missing signer state '${keyId}'`);
      signers.push(structuredClone(signer));
    }

    const newestFirst: ModelSignerTrustEvent[] = [];
    for (const id of auditIndex) {
      const event = await this.storage.get<ModelSignerTrustEvent>(NAMESPACE, id);
      if (!event) throw new Error(`Portable signer-audit export found missing event '${id}'`);
      newestFirst.push(structuredClone(event));
    }

    const body: MioSignerAuditPortableBundleBody = {
      schemaVersion: 1,
      kind: 'MIO_SIGNER_TRUST_AUDIT_BUNDLE_V1',
      exportedAt,
      sourceVerification: structuredClone(verification),
      signers,
      events: newestFirst.reverse(),
    };
    const bundle: MioSignerAuditPortableBundle = {
      ...body,
      bundleSha256: await sha256Hex(stableJsonStringify(body)),
    };
    const portableVerification = await verifyPortableSignerAuditBundle(bundle);
    if (portableVerification.state === 'CORRUPT') {
      throw new Error(`Portable signer-audit export self-verification failed: ${portableVerification.reasons.join('; ')}`);
    }
    return structuredClone(bundle);
  }
}

export const signerAuditPortableBundleService = new SignerAuditPortableBundleService();
