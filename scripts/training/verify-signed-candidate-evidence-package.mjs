#!/usr/bin/env node
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

const PACKAGE_KIND = 'MIO_CANDIDATE_EVIDENCE_PACKAGE_V1';
const PAYLOAD_KIND = 'MIO_CANDIDATE_EVIDENCE_SIGNATURE_V1';
const ENVELOPE_KIND = 'MIO_SIGNED_CANDIDATE_EVIDENCE_PACKAGE_V1';
const ALGORITHM = 'ECDSA_P256_SHA256';
const MAX_ENVELOPE_BYTES = 20 * 1024 * 1024;
const MAX_PUBLIC_KEY_BYTES = 32 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_KEY_ID = /^p256:[a-f0-9]{64}$/;

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function packageBody(pkg) {
  return {
    schemaVersion: pkg.schemaVersion,
    kind: pkg.kind,
    exportedAt: pkg.exportedAt,
    candidate: pkg.candidate,
    manifest: pkg.manifest,
    evidence: pkg.evidence,
    gates: pkg.gates,
    disclosure: pkg.disclosure,
  };
}

function publicKeyId(publicKey) {
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  return `p256:${sha256Hex(spki)}`;
}

function validateEmbeddedPackage(pkg) {
  const errors = [];
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return ['embedded package missing'];
  if (pkg.schemaVersion !== 1 || pkg.kind !== PACKAGE_KIND) errors.push('embedded package schema/kind invalid');
  if (!SHA256.test(pkg.packageSha256 ?? '')) errors.push('embedded package SHA-256 malformed');
  else if (sha256Hex(Buffer.from(stableJson(packageBody(pkg)), 'utf8')) !== pkg.packageSha256) errors.push('embedded package SHA-256 digest mismatch');
  if (!pkg.candidate?.id || !pkg.manifest?.id || pkg.candidate.manifestId !== pkg.manifest.id) errors.push('embedded package candidate/manifest identity mismatch');
  if (pkg.candidate?.bundleId !== pkg.manifest?.dataset?.id || pkg.candidate?.datasetSha256 !== pkg.manifest?.dataset?.fingerprint) errors.push('embedded package dataset identity mismatch');
  if (pkg.candidate?.artifactUri !== pkg.manifest?.adapterUri) errors.push('embedded package artifact identity mismatch');
  return errors;
}

function validatePayload(envelope) {
  const errors = [];
  const payload = envelope.payload;
  const pkg = envelope.package;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['signature payload missing'];
  if (payload.schemaVersion !== 1 || payload.kind !== PAYLOAD_KIND) errors.push('signature payload schema/kind invalid');
  if (payload.packageSha256 !== pkg?.packageSha256) errors.push('signature payload package SHA-256 mismatch');
  if (payload.candidateId !== pkg?.candidate?.id) errors.push('signature payload candidateId mismatch');
  if (payload.manifestId !== pkg?.manifest?.id) errors.push('signature payload manifestId mismatch');
  if (payload.lifecycle !== pkg?.manifest?.lifecycle) errors.push('signature payload lifecycle mismatch');
  if (payload.exportedAt !== pkg?.exportedAt) errors.push('signature payload exportedAt mismatch');
  if (!payload.issuer?.trim() || payload.issuer.length > 200) errors.push('signature payload issuer invalid');
  if (!Number.isSafeInteger(payload.signedAt) || payload.signedAt <= 0 || payload.signedAt < pkg?.exportedAt) errors.push('signature payload signedAt invalid');
  return errors;
}

function verifyEnvelope(envelope, publicKeyPem) {
  const errors = [];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return { valid: false, errors: ['signed envelope must be a JSON object'] };
  if (envelope.schemaVersion !== 1 || envelope.kind !== ENVELOPE_KIND) errors.push('signed envelope schema/kind invalid');
  errors.push(...validateEmbeddedPackage(envelope.package), ...validatePayload(envelope));
  const signature = envelope.signature;
  if (!signature || typeof signature !== 'object' || Array.isArray(signature)) errors.push('signature section missing');
  else {
    if (signature.algorithm !== ALGORITHM) errors.push('signature algorithm invalid');
    if (!SAFE_KEY_ID.test(signature.keyId ?? '')) errors.push('signature keyId malformed');
    if (!signature.valueBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature.valueBase64)) errors.push('signature value invalid base64');
  }

  let keyId;
  try {
    const publicKey = createPublicKey(publicKeyPem);
    if (publicKey.asymmetricKeyType !== 'ec') errors.push('public key must be EC');
    const curve = publicKey.asymmetricKeyDetails?.namedCurve;
    if (curve && !['prime256v1', 'secp256r1', 'P-256'].includes(curve)) errors.push(`public key curve must be P-256/prime256v1, found ${curve}`);
    keyId = publicKeyId(publicKey);
    if (signature?.keyId && keyId !== signature.keyId) errors.push('provided public key does not match envelope keyId');
    if (signature?.valueBase64 && signature?.algorithm === ALGORITHM) {
      const verified = cryptoVerify(
        'sha256',
        Buffer.from(stableJson(envelope.payload), 'utf8'),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature.valueBase64, 'base64'),
      );
      if (!verified) errors.push('candidate evidence signature verification failed');
    }
  } catch (error) {
    errors.push(`public-key verification failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    signerKeyId: keyId,
    packageSha256: envelope.package?.packageSha256,
    candidateId: envelope.package?.candidate?.id,
    lifecycle: envelope.package?.manifest?.lifecycle,
    payloadSha256: envelope.payload ? sha256Hex(Buffer.from(stableJson(envelope.payload), 'utf8')) : undefined,
    envelopeSha256: sha256Hex(Buffer.from(stableJson(envelope), 'utf8')),
    trustStatement: 'Cryptographic verification only. Trust in the supplied public key must be established independently.',
  };
}

function samplePackage() {
  const candidate = {
    schemaVersion: 1,
    id: 'candidate:verify-self-test',
    manifestId: 'candidate:verify-self-test',
    bundleId: 'mio-train-verify-self-test',
    artifactUri: 'local-model://verify-self-test/latest',
    trainingResultSha256: '1'.repeat(64),
    datasetSha256: '2'.repeat(64),
    configSha256: '3'.repeat(64),
    registeredAt: 1000,
    status: 'REGISTERED_UNEVALUATED',
  };
  const manifest = {
    schemaVersion: 1,
    id: candidate.manifestId,
    runtimeModel: 'mio-verify-self-test:latest',
    displayName: 'Mio Verify Self Test',
    baseModel: 'Qwen/Qwen3-8B',
    trainingMethod: 'QLORA',
    adapterUri: candidate.artifactUri,
    createdAt: 900,
    dataset: { id: candidate.bundleId, fingerprint: candidate.datasetSha256, exampleCount: 1 },
    benchmarkPolicy: { minPassRate: 0.9, minScoreRatio: 0.9, requiredDomains: ['GENERAL'] },
    review: { dataGovernanceReviewed: false, securityReviewed: false },
    lifecycle: 'EXPERIMENTAL',
  };
  const body = {
    schemaVersion: 1,
    kind: PACKAGE_KIND,
    exportedAt: 2000,
    candidate,
    manifest,
    evidence: { signerSummaries: [], promotion: {} },
    gates: { releaseCandidateEligible: false, releaseBlockingReasons: ['not reviewed'], promotionEligible: false, promotionBlockingReasons: ['not release candidate'] },
    disclosure: 'Verifier self-test.',
  };
  return { ...body, packageSha256: sha256Hex(Buffer.from(stableJson(body), 'utf8')) };
}

function selfTest() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pkg = samplePackage();
  const payload = {
    schemaVersion: 1,
    kind: PAYLOAD_KIND,
    packageSha256: pkg.packageSha256,
    candidateId: pkg.candidate.id,
    manifestId: pkg.manifest.id,
    lifecycle: pkg.manifest.lifecycle,
    exportedAt: pkg.exportedAt,
    issuer: 'MIO verifier self-test',
    signedAt: 3000,
  };
  const signatureBytes = cryptoSign('sha256', Buffer.from(stableJson(payload), 'utf8'), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  const envelope = {
    schemaVersion: 1,
    kind: ENVELOPE_KIND,
    package: pkg,
    payload,
    signature: { algorithm: ALGORITHM, keyId: publicKeyId(publicKey), valueBase64: signatureBytes.toString('base64') },
  };
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const verified = verifyEnvelope(envelope, publicPem);
  if (!verified.valid) throw new Error(`valid self-test envelope rejected: ${verified.errors.join('; ')}`);
  const tampered = structuredClone(envelope);
  tampered.payload.lifecycle = 'PROMOTED';
  if (verifyEnvelope(tampered, publicPem).valid) throw new Error('payload tampering was not blocked');
  const wrongPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  if (verifyEnvelope(envelope, wrongPair.publicKey.export({ type: 'spki', format: 'pem' })).valid) throw new Error('wrong public key was not blocked');
  console.log('MIO SIGNED CANDIDATE EVIDENCE VERIFIER SELF-TEST: PASS');
  console.log('Verification establishes signature validity for the supplied public key, not independent trust in that key.');
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--self-test') { args.selfTest = true; continue; }
    if (!item.startsWith('--')) throw new Error(`Unexpected argument: ${item}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${item}`);
    args[item.slice(2)] = value;
    index += 1;
  }
  return args;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    selfTest();
  } else if (args.input && args['public-key']) {
    if (statSync(args.input).size > MAX_ENVELOPE_BYTES) throw new Error('Signed candidate evidence envelope exceeds the 20 MiB verification limit');
    if (statSync(args['public-key']).size > MAX_PUBLIC_KEY_BYTES) throw new Error('Public key exceeds the 32 KiB verification limit');
    const envelope = JSON.parse(readFileSync(args.input, 'utf8'));
    const publicPem = readFileSync(args['public-key'], 'utf8');
    const result = verifyEnvelope(envelope, publicPem);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } else {
    console.error('Usage: node scripts/training/verify-signed-candidate-evidence-package.mjs --input signed-candidate-evidence.json --public-key signer-public.pem');
    console.error('       node scripts/training/verify-signed-candidate-evidence-package.mjs --self-test');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
