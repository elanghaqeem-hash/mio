#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_KEY_ID = /^p256:[a-f0-9]{64}$/;
const MAX_SIGNERS = 500;
const MAX_EVENTS = 10_000;
const MAX_BYTES = 16 * 1024 * 1024;

function stableJsonStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(',')}}`;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function auditEventHashMaterial(event) {
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

function bundleBody(bundle) {
  return {
    schemaVersion: bundle.schemaVersion,
    kind: bundle.kind,
    exportedAt: bundle.exportedAt,
    sourceVerification: bundle.sourceVerification,
    signers: bundle.signers,
    events: bundle.events,
  };
}

function verify(bundle) {
  const reasons = [];
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return { state: 'CORRUPT', reasons: ['Bundle must be a JSON object'] };
  if (bundle.schemaVersion !== 1) reasons.push('Unsupported bundle schema');
  if (bundle.kind !== 'MIO_SIGNER_TRUST_AUDIT_BUNDLE_V1') reasons.push('Unsupported bundle kind');
  if (!Number.isSafeInteger(bundle.exportedAt) || bundle.exportedAt <= 0) reasons.push('exportedAt is invalid');
  if (!Array.isArray(bundle.signers)) reasons.push('signers must be an array');
  if (!Array.isArray(bundle.events)) reasons.push('events must be an array');
  if (!SHA256.test(bundle.bundleSha256 ?? '')) reasons.push('bundleSha256 is malformed');

  const signers = Array.isArray(bundle.signers) ? bundle.signers : [];
  const events = Array.isArray(bundle.events) ? bundle.events : [];
  if (signers.length > MAX_SIGNERS) reasons.push(`signer count exceeds ${MAX_SIGNERS}`);
  if (events.length > MAX_EVENTS) reasons.push(`event count exceeds ${MAX_EVENTS}`);

  if (SHA256.test(bundle.bundleSha256 ?? '')) {
    const computed = sha256Hex(stableJsonStringify(bundleBody(bundle)));
    if (computed !== bundle.bundleSha256) reasons.push('bundle digest mismatch');
  }

  const signerMap = new Map();
  for (const signer of signers) {
    if (signer.schemaVersion !== 1) reasons.push(`Signer '${signer.keyId ?? 'unknown'}' schema is invalid`);
    if (!SAFE_KEY_ID.test(signer.keyId ?? '')) reasons.push(`Signer '${signer.keyId ?? 'unknown'}' keyId is invalid`);
    if (!signer.label?.trim()) reasons.push(`Signer '${signer.keyId ?? 'unknown'}' label is missing`);
    if (signer.status !== 'TRUSTED' && signer.status !== 'REVOKED') reasons.push(`Signer '${signer.keyId ?? 'unknown'}' status is invalid`);
    if (!Number.isSafeInteger(signer.trustedAt) || signer.trustedAt <= 0) reasons.push(`Signer '${signer.keyId ?? 'unknown'}' trustedAt is invalid`);
    if (signerMap.has(signer.keyId)) reasons.push(`Duplicate signer '${signer.keyId}'`);
    signerMap.set(signer.keyId, signer);
    try {
      const der = Buffer.from(String(signer.publicKeySpkiBase64 ?? '').replace(/\s+/g, ''), 'base64');
      if (!der.length) throw new Error('empty');
      const computedKeyId = `p256:${crypto.createHash('sha256').update(der).digest('hex')}`;
      if (computedKeyId !== signer.keyId) reasons.push(`Signer '${signer.keyId}' public key does not match keyId`);
    } catch {
      reasons.push(`Signer '${signer.keyId ?? 'unknown'}' public key is invalid`);
    }
  }

  let legacy = false;
  let previousHash;
  const latestByKey = new Map();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const expectedSequence = index + 1;
    if (event.schemaVersion !== 1) reasons.push(`Event ${expectedSequence} schema is invalid`);
    if (event.sequence !== expectedSequence) reasons.push(`Event '${event.id}' sequence mismatch`);
    if (!SAFE_KEY_ID.test(event.keyId ?? '')) reasons.push(`Event '${event.id}' keyId is invalid`);
    if (!event.label?.trim() || !event.actor?.trim()) reasons.push(`Event '${event.id}' label/actor is missing`);
    if (!['TRUST', 'RETRUST', 'REVOKE'].includes(event.action)) reasons.push(`Event '${event.id}' action is invalid`);
    if (!['TRUSTED', 'REVOKED'].includes(event.resultingStatus)) reasons.push(`Event '${event.id}' resultingStatus is invalid`);
    if (!Number.isSafeInteger(event.occurredAt) || event.occurredAt <= 0) reasons.push(`Event '${event.id}' occurredAt is invalid`);

    const computedHash = sha256Hex(stableJsonStringify(auditEventHashMaterial(event)));
    if (!event.eventHash) legacy = true;
    else {
      if (!SHA256.test(event.eventHash)) reasons.push(`Event '${event.id}' eventHash is malformed`);
      if (event.eventHash !== computedHash) reasons.push(`Event '${event.id}' hash mismatch`);
      const expectedId = `signer-trust-event:${event.sequence}:${computedHash.slice(0, 20)}`;
      if (event.id !== expectedId) reasons.push(`Event '${event.id}' hash identity mismatch`);
    }
    if (previousHash) {
      if (!event.previousEventHash) legacy = true;
      else if (event.previousEventHash !== previousHash) reasons.push(`Event '${event.id}' predecessor hash mismatch`);
    } else if (event.previousEventHash) reasons.push(`First event '${event.id}' unexpectedly references predecessor`);
    previousHash = computedHash;
    latestByKey.set(event.keyId, event);
  }

  for (const [keyId, latest] of latestByKey) {
    const signer = signerMap.get(keyId);
    if (!signer) reasons.push(`Signer '${keyId}' is missing from signer records`);
    else {
      if (signer.status !== latest.resultingStatus) reasons.push(`Signer '${keyId}' status disagrees with audit`);
      if (signer.label !== latest.label) reasons.push(`Signer '${keyId}' label disagrees with audit`);
    }
  }
  for (const signer of signers) if (!latestByKey.has(signer.keyId)) reasons.push(`Signer '${signer.keyId}' has no audit event`);

  const source = bundle.sourceVerification;
  if (!source || source.schemaVersion !== 1) reasons.push('sourceVerification is missing or invalid');
  else {
    if (source.checkedEvents !== events.length) reasons.push('sourceVerification event count mismatch');
    if (source.latestEventHash && source.latestEventHash !== previousHash) reasons.push('sourceVerification latest hash mismatch');
    if (source.state === 'CORRUPT') reasons.push('bundle source state is CORRUPT');
  }

  return {
    state: reasons.length ? 'CORRUPT' : events.length === 0 ? 'EMPTY' : legacy ? 'LEGACY_UNCHAINED' : 'VALID',
    checkedEvents: events.length,
    checkedSigners: signers.length,
    latestEventHash: previousHash,
    bundleSha256: SHA256.test(bundle.bundleSha256 ?? '') ? bundle.bundleSha256 : undefined,
    reasons: [...new Set(reasons)],
  };
}

function selfTest() {
  const publicKeySpkiBase64 = 'AQIDBA==';
  const keyId = `p256:${crypto.createHash('sha256').update(Buffer.from(publicKeySpkiBase64, 'base64')).digest('hex')}`;
  const eventBase = {
    schemaVersion: 1,
    id: '',
    sequence: 1,
    action: 'TRUST',
    keyId,
    label: 'Self Test',
    actor: 'offline-verifier-self-test',
    resultingStatus: 'TRUSTED',
    occurredAt: 1,
  };
  const eventHash = sha256Hex(stableJsonStringify(auditEventHashMaterial(eventBase)));
  const event = { ...eventBase, id: `signer-trust-event:1:${eventHash.slice(0, 20)}`, eventHash };
  const body = {
    schemaVersion: 1,
    kind: 'MIO_SIGNER_TRUST_AUDIT_BUNDLE_V1',
    exportedAt: 2,
    sourceVerification: { schemaVersion: 1, state: 'VALID', checkedEvents: 1, latestEventHash: eventHash, reasons: [] },
    signers: [{ schemaVersion: 1, keyId, label: 'Self Test', publicKeySpkiBase64, status: 'TRUSTED', trustedAt: 1 }],
    events: [event],
  };
  const bundle = { ...body, bundleSha256: sha256Hex(stableJsonStringify(body)) };
  const good = verify(bundle);
  if (good.state !== 'VALID') throw new Error(`self-test valid bundle failed: ${good.reasons.join('; ')}`);
  const tampered = structuredClone(bundle);
  tampered.events[0].actor = 'tampered';
  if (verify(tampered).state !== 'CORRUPT') throw new Error('self-test failed to detect tampering');
  console.log('MIO signer audit portable verifier self-test: PASS');
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  selfTest();
  process.exit(0);
}
if (args.length !== 1) {
  console.error('Usage: node scripts/training/verify-signer-audit-bundle.mjs <bundle.json>');
  console.error('       node scripts/training/verify-signer-audit-bundle.mjs --self-test');
  process.exit(2);
}

const path = args[0];
const stat = fs.statSync(path);
if (stat.size > MAX_BYTES) {
  console.error('CORRUPT: bundle exceeds 16 MiB verification limit');
  process.exit(1);
}
const bundle = JSON.parse(fs.readFileSync(path, 'utf8'));
const result = verify(bundle);
console.log(JSON.stringify(result, null, 2));
process.exit(result.state === 'CORRUPT' ? 1 : 0);
