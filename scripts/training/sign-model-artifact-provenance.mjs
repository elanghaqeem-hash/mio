#!/usr/bin/env node
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const KIND = 'MIO_MODEL_ARTIFACT_PROVENANCE_V1';
const ALGORITHM = 'ECDSA_P256_SHA256';

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--self-test') args.selfTest = true;
    else if (item.startsWith('--')) {
      const key = item.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${item}`);
      args[key] = value;
      index += 1;
    } else throw new Error(`Unexpected argument: ${item}`);
  }
  return args;
}

function requirePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Payload must be a JSON object');
  if (payload.schemaVersion !== 1 || payload.kind !== KIND) throw new Error(`Payload must use schemaVersion 1 and kind ${KIND}`);
  const required = [
    'candidateId', 'manifestId', 'bundleId', 'trainingResultSha256', 'datasetSha256', 'configSha256',
    'runtimeModel', 'baseModel', 'trainingMethod', 'artifactUri', 'artifactFingerprint',
    'artifactCanonicalization', 'fileCount', 'totalBytes', 'issuer', 'issuedAt',
  ];
  for (const key of required) if (payload[key] === undefined) throw new Error(`Payload field '${key}' is missing`);
  return payload;
}

function assertP256PrivateKey(privateKey) {
  if (privateKey.asymmetricKeyType !== 'ec') throw new Error('Private key must be an EC key');
  const curve = privateKey.asymmetricKeyDetails?.namedCurve;
  if (curve && !['prime256v1', 'secp256r1', 'P-256'].includes(curve)) throw new Error(`Private key curve must be P-256/prime256v1, found ${curve}`);
}

function signPayload(payload, privateKeyPem) {
  requirePayload(payload);
  const privateKey = createPrivateKey(privateKeyPem);
  assertP256PrivateKey(privateKey);
  const publicKey = createPublicKey(privateKey);
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const keyId = `p256:${sha256Hex(spki)}`;
  const canonical = stableJson(payload);
  const signature = cryptoSign('sha256', Buffer.from(canonical, 'utf8'), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  if (signature.length !== 64) throw new Error(`Unexpected P-256 signature size: ${signature.length}`);
  return {
    envelope: {
      schemaVersion: 1,
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

function selfTest() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const payload = {
    schemaVersion: 1,
    kind: KIND,
    candidateId: 'candidate:self-test',
    manifestId: 'candidate:self-test',
    bundleId: 'mio-train-self-test',
    trainingResultSha256: '1'.repeat(64),
    datasetSha256: '2'.repeat(64),
    configSha256: '3'.repeat(64),
    runtimeModel: 'mio-self-test:latest',
    baseModel: 'Qwen/Qwen3-8B',
    trainingMethod: 'QLORA',
    artifactUri: 'local-model://mio-self-test/latest',
    artifactFingerprint: '4'.repeat(64),
    artifactCanonicalization: 'mio-adapter-tree-v1',
    fileCount: 3,
    totalBytes: 1024,
    issuer: 'MIO provenance self-test',
    issuedAt: 1,
  };
  const signed = signPayload(payload, privatePem);
  const signature = Buffer.from(signed.envelope.signature.valueBase64, 'base64');
  const canonical = Buffer.from(stableJson(payload), 'utf8');
  const verified = cryptoVerify('sha256', canonical, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
  if (!verified) throw new Error('Self-test signature verification failed');
  const tampered = Buffer.from(stableJson({ ...payload, totalBytes: 1025 }), 'utf8');
  if (cryptoVerify('sha256', tampered, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature)) throw new Error('Self-test tamper detection failed');
  console.log('MIO SIGNED ARTIFACT PROVENANCE SELF-TEST: PASS');
  console.log(`Key id: ${signed.keyId}`);
  console.log('No private key was persisted, uploaded, or imported into Mio.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    selfTest();
    return;
  }
  if (!args.payload || !args['private-key'] || !args.output) {
    throw new Error('Usage: node scripts/training/sign-model-artifact-provenance.mjs --payload payload.json --private-key signer-private.pem --output mio-artifact-provenance.json [--public-key-output signer-public.pem]');
  }

  const payload = requirePayload(JSON.parse(readFileSync(args.payload, 'utf8')));
  const privatePem = readFileSync(args['private-key'], 'utf8');
  const signed = signPayload(payload, privatePem);
  writeFileSync(args.output, `${JSON.stringify(signed.envelope, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  if (args['public-key-output']) writeFileSync(args['public-key-output'], signed.publicKeyPem, { encoding: 'utf8', flag: 'wx' });
  console.log('MIO SIGNED ARTIFACT PROVENANCE: CREATED');
  console.log(`Key id: ${signed.keyId}`);
  console.log(`Envelope: ${args.output}`);
  if (args['public-key-output']) console.log(`Public key: ${args['public-key-output']}`);
  console.log('Import only the public key into Mio trust settings. Keep the private key outside Mio.');
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
