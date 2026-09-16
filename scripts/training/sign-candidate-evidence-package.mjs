#!/usr/bin/env node
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const PACKAGE_KIND = 'MIO_CANDIDATE_EVIDENCE_PACKAGE_V1';
const PAYLOAD_KIND = 'MIO_CANDIDATE_EVIDENCE_SIGNATURE_V1';
const ENVELOPE_KIND = 'MIO_SIGNED_CANDIDATE_EVIDENCE_PACKAGE_V1';
const ALGORITHM = 'ECDSA_P256_SHA256';
const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;

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

function requirePackage(pkg) {
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('Candidate evidence package must be a JSON object');
  if (pkg.schemaVersion !== 1 || pkg.kind !== PACKAGE_KIND) throw new Error(`Candidate evidence package must use schemaVersion 1 and kind ${PACKAGE_KIND}`);
  if (!SHA256.test(pkg.packageSha256 ?? '')) throw new Error('Candidate evidence package SHA-256 is malformed');
  const computed = sha256Hex(Buffer.from(stableJson(packageBody(pkg)), 'utf8'));
  if (computed !== pkg.packageSha256) throw new Error('Candidate evidence package SHA-256 digest mismatch');
  if (!pkg.candidate?.id || !pkg.manifest?.id || pkg.candidate.manifestId !== pkg.manifest.id) throw new Error('Candidate evidence package candidate/manifest identity is inconsistent');
  if (pkg.candidate.bundleId !== pkg.manifest.dataset?.id || pkg.candidate.datasetSha256 !== pkg.manifest.dataset?.fingerprint) throw new Error('Candidate evidence package dataset identity is inconsistent');
  if (pkg.candidate.artifactUri !== pkg.manifest.adapterUri) throw new Error('Candidate evidence package artifact identity is inconsistent');
  return pkg;
}

function boundedIssuer(value) {
  const issuer = value.trim().slice(0, 200);
  if (!issuer) throw new Error('Signature issuer is required');
  return issuer;
}

function buildPayload(pkg, issuerInput, signedAt) {
  requirePackage(pkg);
  const issuer = boundedIssuer(issuerInput);
  if (!Number.isSafeInteger(signedAt) || signedAt <= 0 || signedAt < pkg.exportedAt) throw new Error('Signature timestamp is invalid or predates package export');
  return {
    schemaVersion: 1,
    kind: PAYLOAD_KIND,
    packageSha256: pkg.packageSha256,
    candidateId: pkg.candidate.id,
    manifestId: pkg.manifest.id,
    lifecycle: pkg.manifest.lifecycle,
    exportedAt: pkg.exportedAt,
    issuer,
    signedAt,
  };
}

function assertP256PrivateKey(privateKey) {
  if (privateKey.asymmetricKeyType !== 'ec') throw new Error('Private key must be an EC key');
  const curve = privateKey.asymmetricKeyDetails?.namedCurve;
  if (curve && !['prime256v1', 'secp256r1', 'P-256'].includes(curve)) throw new Error(`Private key curve must be P-256/prime256v1, found ${curve}`);
}

function signPackage(pkg, issuer, signedAt, privateKeyPem) {
  const payload = buildPayload(pkg, issuer, signedAt);
  const privateKey = createPrivateKey(privateKeyPem);
  assertP256PrivateKey(privateKey);
  const publicKey = createPublicKey(privateKey);
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const keyId = `p256:${sha256Hex(spki)}`;
  const canonical = Buffer.from(stableJson(payload), 'utf8');
  const signature = cryptoSign('sha256', canonical, { key: privateKey, dsaEncoding: 'ieee-p1363' });
  if (signature.length !== 64) throw new Error(`Unexpected P-256 signature size: ${signature.length}`);
  return {
    envelope: {
      schemaVersion: 1,
      kind: ENVELOPE_KIND,
      package: pkg,
      payload,
      signature: {
        algorithm: ALGORITHM,
        keyId,
        valueBase64: signature.toString('base64'),
      },
    },
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    keyId,
  };
}

function samplePackage() {
  const candidate = {
    schemaVersion: 1,
    id: 'candidate:signed-self-test',
    manifestId: 'candidate:signed-self-test',
    bundleId: 'mio-train-signed-self-test',
    artifactUri: 'local-model://signed-self-test/latest',
    trainingResultSha256: '1'.repeat(64),
    datasetSha256: '2'.repeat(64),
    configSha256: '3'.repeat(64),
    registeredAt: 1000,
    status: 'REGISTERED_UNEVALUATED',
  };
  const manifest = {
    schemaVersion: 1,
    id: candidate.manifestId,
    runtimeModel: 'mio-signed-self-test:latest',
    displayName: 'Mio Signed Self Test',
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
    disclosure: 'Signed candidate evidence self-test.',
  };
  return { ...body, packageSha256: sha256Hex(Buffer.from(stableJson(body), 'utf8')) };
}

function selfTest() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const signed = signPackage(samplePackage(), 'MIO signed candidate self-test', 3000, privatePem);
  const canonical = Buffer.from(stableJson(signed.envelope.payload), 'utf8');
  const signature = Buffer.from(signed.envelope.signature.valueBase64, 'base64');
  if (!cryptoVerify('sha256', canonical, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature)) throw new Error('Self-test signature verification failed');
  const tamperedPayload = { ...signed.envelope.payload, lifecycle: 'PROMOTED' };
  if (cryptoVerify('sha256', Buffer.from(stableJson(tamperedPayload), 'utf8'), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature)) throw new Error('Self-test payload tampering was not detected');
  console.log('MIO SIGNED CANDIDATE EVIDENCE SELF-TEST: PASS');
  console.log(`Key id: ${signed.keyId}`);
  console.log('Private key remained outside Mio and was not persisted by the self-test.');
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) return selfTest();
  if (!args.package || !args['private-key'] || !args.output || !args.issuer) {
    throw new Error('Usage: node scripts/training/sign-candidate-evidence-package.mjs --package candidate-evidence.json --private-key signer-private.pem --issuer <label> --output signed-candidate-evidence.json [--public-key-output signer-public.pem] [--signed-at <ms>]');
  }
  if (statSync(args.package).size > MAX_PACKAGE_BYTES) throw new Error('Candidate evidence package exceeds the 16 MiB signing limit');
  const pkg = requirePackage(JSON.parse(readFileSync(args.package, 'utf8')));
  const privatePem = readFileSync(args['private-key'], 'utf8');
  const signedAt = args['signed-at'] ? Number(args['signed-at']) : Date.now();
  const signed = signPackage(pkg, args.issuer, signedAt, privatePem);
  writeFileSync(args.output, `${JSON.stringify(signed.envelope, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  if (args['public-key-output']) writeFileSync(args['public-key-output'], signed.publicKeyPem, { encoding: 'utf8', flag: 'wx' });
  console.log('MIO SIGNED CANDIDATE EVIDENCE: CREATED');
  console.log(`Key id: ${signed.keyId}`);
  console.log(`Envelope: ${args.output}`);
  if (args['public-key-output']) console.log(`Public key: ${args['public-key-output']}`);
  console.log('Trust/import only the public key in Mio. Keep the private key outside Mio.');
}

try { main(); } catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
