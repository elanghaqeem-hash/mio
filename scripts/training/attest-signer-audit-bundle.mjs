#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const MAX_BUNDLE_BYTES = 16 * 1024 * 1024;
const MAX_ATTESTATION_BYTES = 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_KEY_ID = /^p256:[a-f0-9]{64}$/;

function stableJsonStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(',')}}`;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

function verifyBundleDigest(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new Error('Bundle must be a JSON object');
  if (bundle.schemaVersion !== 1 || bundle.kind !== 'MIO_SIGNER_TRUST_AUDIT_BUNDLE_V1') throw new Error('Unsupported signer audit bundle schema or kind');
  if (!Number.isSafeInteger(bundle.exportedAt) || bundle.exportedAt <= 0) throw new Error('Bundle exportedAt is invalid');
  if (!SHA256.test(bundle.bundleSha256 ?? '')) throw new Error('Bundle SHA-256 is malformed');
  const computed = sha256Hex(stableJsonStringify(bundleBody(bundle)));
  if (computed !== bundle.bundleSha256) throw new Error('Bundle SHA-256 digest mismatch');
  return computed;
}

function asPrivateKey(input) {
  if (input instanceof crypto.KeyObject) {
    if (input.type !== 'private') throw new Error('Audit attestation signing requires a private key');
    return input;
  }
  return crypto.createPrivateKey(input);
}

function asPublicKey(input) {
  if (input instanceof crypto.KeyObject) {
    if (input.type === 'public') return input;
    if (input.type === 'private') return crypto.createPublicKey(input);
    throw new Error('Audit attestation verification requires an asymmetric public key');
  }
  return crypto.createPublicKey(input);
}

function assertP256Key(key, label) {
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error(`${label} must be ECDSA P-256 / prime256v1`);
  }
}

function publicKeyId(publicKeyInput) {
  const key = asPublicKey(publicKeyInput);
  assertP256Key(key, 'Audit attestation authority key');
  const spki = key.export({ type: 'spki', format: 'der' });
  return `p256:${crypto.createHash('sha256').update(spki).digest('hex')}`;
}

function privateKeyAndId(privateKeyInput) {
  const privateKey = asPrivateKey(privateKeyInput);
  assertP256Key(privateKey, 'Audit attestation private key');
  const publicKey = asPublicKey(privateKey);
  return { privateKey, authorityKeyId: publicKeyId(publicKey) };
}

function boundedAuthority(value) {
  const authority = String(value ?? '').trim().slice(0, 200);
  if (!authority) throw new Error('Attestation authority label is required');
  return authority;
}

function createPayload(bundle, authority, authorityKeyId, issuedAt) {
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) throw new Error('Attestation issuedAt must be a positive integer timestamp');
  return {
    schemaVersion: 1,
    kind: 'MIO_SIGNER_AUDIT_ATTESTATION_V1',
    bundleKind: bundle.kind,
    bundleSha256: bundle.bundleSha256,
    exportedAt: bundle.exportedAt,
    ...(bundle.sourceVerification?.latestEventHash ? { latestEventHash: bundle.sourceVerification.latestEventHash } : {}),
    authority,
    authorityKeyId,
    issuedAt,
  };
}

function signBundle(bundle, privateKeyInput, authorityInput, issuedAt = Date.now()) {
  verifyBundleDigest(bundle);
  const authority = boundedAuthority(authorityInput);
  const { privateKey, authorityKeyId } = privateKeyAndId(privateKeyInput);
  const payload = createPayload(bundle, authority, authorityKeyId, issuedAt);
  const signature = crypto.sign('sha256', Buffer.from(stableJsonStringify(payload)), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  if (signature.length !== 64) throw new Error('P-256 attestation signature must use 64-byte IEEE-P1363 encoding');
  return {
    schemaVersion: 1,
    payload,
    signature: {
      algorithm: 'ECDSA_P256_SHA256',
      valueBase64: signature.toString('base64'),
    },
  };
}

function verifyAttestation(bundle, attestation, publicKeyInput) {
  const reasons = [];
  try { verifyBundleDigest(bundle); } catch (error) { reasons.push(error instanceof Error ? error.message : 'Bundle digest validation failed'); }
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    return { state: 'CORRUPT', authorityKeyId: undefined, reasons: [...reasons, 'Attestation must be a JSON object'] };
  }
  if (attestation.schemaVersion !== 1) reasons.push('Unsupported attestation envelope schema');
  const payload = attestation.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) reasons.push('Attestation payload is missing');
  if (!attestation.signature || typeof attestation.signature !== 'object') reasons.push('Attestation signature is missing');
  if (attestation.signature?.algorithm !== 'ECDSA_P256_SHA256') reasons.push('Attestation signature algorithm is invalid');

  let authorityKeyId;
  let publicKey;
  try {
    publicKey = asPublicKey(publicKeyInput);
    assertP256Key(publicKey, 'Audit attestation authority key');
    authorityKeyId = publicKeyId(publicKey);
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : 'Authority public key is invalid');
  }

  if (payload) {
    if (payload.schemaVersion !== 1 || payload.kind !== 'MIO_SIGNER_AUDIT_ATTESTATION_V1') reasons.push('Unsupported attestation payload schema or kind');
    if (payload.bundleKind !== bundle.kind) reasons.push('Attestation bundle kind does not match bundle');
    if (payload.bundleSha256 !== bundle.bundleSha256) reasons.push('Attestation bundle SHA-256 does not match bundle');
    if (payload.exportedAt !== bundle.exportedAt) reasons.push('Attestation exportedAt does not match bundle');
    const expectedLatest = bundle.sourceVerification?.latestEventHash;
    if ((payload.latestEventHash ?? undefined) !== (expectedLatest ?? undefined)) reasons.push('Attestation latest event hash does not match bundle');
    if (!String(payload.authority ?? '').trim() || String(payload.authority).length > 200) reasons.push('Attestation authority label is invalid');
    if (!SAFE_KEY_ID.test(payload.authorityKeyId ?? '')) reasons.push('Attestation authority key ID is invalid');
    if (authorityKeyId && payload.authorityKeyId !== authorityKeyId) reasons.push('Attestation authority key ID does not match supplied public key');
    if (!Number.isSafeInteger(payload.issuedAt) || payload.issuedAt <= 0) reasons.push('Attestation issuedAt is invalid');
  }

  let signature;
  try {
    signature = Buffer.from(String(attestation.signature?.valueBase64 ?? ''), 'base64');
    if (signature.length !== 64) reasons.push('Attestation signature must be 64-byte IEEE-P1363 P-256 data');
  } catch {
    reasons.push('Attestation signature is invalid base64');
  }

  if (payload && publicKey && signature?.length === 64) {
    const valid = crypto.verify('sha256', Buffer.from(stableJsonStringify(payload)), {
      key: publicKey,
      dsaEncoding: 'ieee-p1363',
    }, signature);
    if (!valid) reasons.push('Attestation signature verification failed');
  }

  return {
    state: reasons.length ? 'CORRUPT' : 'VALID',
    authorityKeyId,
    authority: payload?.authority,
    issuedAt: payload?.issuedAt,
    bundleSha256: bundle.bundleSha256,
    reasons: [...new Set(reasons)],
  };
}

function readJson(path, maxBytes, label) {
  const stat = fs.statSync(path);
  if (stat.size > maxBytes) throw new Error(`${label} exceeds bounded size limit`);
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function parseArgs(args) {
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item.startsWith('--')) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${item}`);
      options[item.slice(2)] = value;
      index += 1;
    } else positional.push(item);
  }
  return { options, positional };
}

function selfTest() {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const body = {
    schemaVersion: 1,
    kind: 'MIO_SIGNER_TRUST_AUDIT_BUNDLE_V1',
    exportedAt: 10,
    sourceVerification: { schemaVersion: 1, state: 'VALID', checkedEvents: 0, reasons: [] },
    signers: [],
    events: [],
  };
  const bundle = { ...body, bundleSha256: sha256Hex(stableJsonStringify(body)) };
  const attestation = signBundle(bundle, pair.privateKey, 'MIO Audit Authority Self Test', 20);
  const verified = verifyAttestation(bundle, attestation, pair.publicKey);
  if (verified.state !== 'VALID') throw new Error(`Attestation self-test verify failed: ${verified.reasons.join('; ')}`);
  const tamperedBundle = structuredClone(bundle);
  tamperedBundle.exportedAt = 11;
  if (verifyAttestation(tamperedBundle, attestation, pair.publicKey).state !== 'CORRUPT') throw new Error('Attestation self-test failed to detect bundle tampering');
  const otherPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  if (verifyAttestation(bundle, attestation, otherPair.publicKey).state !== 'CORRUPT') throw new Error('Attestation self-test failed to detect wrong authority key');
  console.log('MIO signer audit bundle attestation self-test: PASS');
}

const rawArgs = process.argv.slice(2);
if (rawArgs.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

const { options, positional } = parseArgs(rawArgs);
const command = positional[0];
if (command === 'sign') {
  if (!options.bundle || !options['private-key'] || !options.authority || !options.output) {
    console.error('Usage: node scripts/training/attest-signer-audit-bundle.mjs sign --bundle <bundle.json> --private-key <p256-private.pem> --authority <label> --output <attestation.json> [--issued-at <ms>]');
    process.exit(2);
  }
  const bundle = readJson(options.bundle, MAX_BUNDLE_BYTES, 'Bundle');
  const privateKey = fs.readFileSync(options['private-key'], 'utf8');
  const issuedAt = options['issued-at'] ? Number(options['issued-at']) : Date.now();
  const attestation = signBundle(bundle, privateKey, options.authority, issuedAt);
  fs.writeFileSync(options.output, `${JSON.stringify(attestation, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(JSON.stringify({ state: 'SIGNED', authorityKeyId: attestation.payload.authorityKeyId, output: options.output }, null, 2));
  process.exit(0);
}

if (command === 'verify') {
  if (!options.bundle || !options.attestation || !options['public-key']) {
    console.error('Usage: node scripts/training/attest-signer-audit-bundle.mjs verify --bundle <bundle.json> --attestation <attestation.json> --public-key <p256-public.pem>');
    process.exit(2);
  }
  const bundle = readJson(options.bundle, MAX_BUNDLE_BYTES, 'Bundle');
  const attestation = readJson(options.attestation, MAX_ATTESTATION_BYTES, 'Attestation');
  const publicKey = fs.readFileSync(options['public-key'], 'utf8');
  const result = verifyAttestation(bundle, attestation, publicKey);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.state === 'VALID' ? 0 : 1);
}

console.error('Commands: sign, verify, --self-test');
process.exit(2);
