#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'kind', 'exportedAt', 'candidate', 'manifest', 'evidence', 'gates', 'disclosure', 'packageSha256']);
const EVIDENCE_KEYS = new Set(['handoffReceipt', 'latestBenchmark', 'latestIntegrity', 'latestArtifactBinding', 'latestProvenance', 'signerSummaries', 'promotion']);
const PROMOTION_KEYS = new Set(['benchmark', 'integrity', 'artifactBinding', 'provenance']);
const GATE_KEYS = new Set(['releaseCandidateEligible', 'releaseBlockingReasons', 'promotionEligible', 'promotionBlockingReasons']);
const FORBIDDEN_KEYS = new Set([
  'trainingjsonl', 'trainjsonl', 'messages', 'privatekey', 'privatekeypem', 'secret', 'secrets', 'token',
  'accesstoken', 'refreshtoken', 'credential', 'credentials', 'authorization', 'permissiongrant',
  'permissiongrants', 'modelweights', 'adapterbytes', 'rawweights',
]);

function stableJsonStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(',')}}`;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
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

function normalizedKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function privacyErrors(value, currentPath = 'package', depth = 0) {
  if (depth > 32) return [`privacy scan nesting limit exceeded at ${currentPath}`];
  if (value === null || typeof value !== 'object') return [];
  const errors = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => errors.push(...privacyErrors(item, `${currentPath}[${index}]`, depth + 1)));
    return errors;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(normalizedKey(key))) errors.push(`forbidden portable field '${currentPath}.${key}'`);
    errors.push(...privacyErrors(child, `${currentPath}.${key}`, depth + 1));
  }
  return errors;
}

function schemaErrors(pkg) {
  const errors = [];
  for (const key of Object.keys(pkg)) if (!TOP_LEVEL_KEYS.has(key)) errors.push(`unknown top-level field '${key}'`);
  if (pkg.evidence && typeof pkg.evidence === 'object' && !Array.isArray(pkg.evidence)) {
    for (const key of Object.keys(pkg.evidence)) if (!EVIDENCE_KEYS.has(key)) errors.push(`unknown evidence field '${key}'`);
    if (pkg.evidence.promotion && typeof pkg.evidence.promotion === 'object' && !Array.isArray(pkg.evidence.promotion)) {
      for (const key of Object.keys(pkg.evidence.promotion)) if (!PROMOTION_KEYS.has(key)) errors.push(`unknown promotion evidence field '${key}'`);
    }
  }
  if (pkg.gates && typeof pkg.gates === 'object' && !Array.isArray(pkg.gates)) {
    for (const key of Object.keys(pkg.gates)) if (!GATE_KEYS.has(key)) errors.push(`unknown gate field '${key}'`);
  }
  return errors;
}

function benchmarkErrors(summary, manifest, label) {
  if (!summary) return [];
  const errors = [];
  if (summary.manifestId !== manifest.id) errors.push(`${label} benchmark manifest mismatch`);
  if (summary.model !== manifest.runtimeModel) errors.push(`${label} benchmark model mismatch`);
  if (!SHA256.test(summary.sourceReportSha256 ?? '')) errors.push(`${label} benchmark source report SHA-256 malformed`);
  if (!Array.isArray(summary.results)) errors.push(`${label} benchmark result summaries missing`);
  else if (summary.results.some((item) => !item?.id || !item?.domain || typeof item.passed !== 'boolean' || !Number.isFinite(item.score) || !Number.isFinite(item.maxScore) || !Number.isFinite(item.latencyMs))) {
    errors.push(`${label} benchmark case summary malformed`);
  }
  return errors;
}

function identityErrors(pkg) {
  const errors = [];
  const candidate = pkg.candidate;
  const manifest = pkg.manifest;
  const evidence = pkg.evidence;
  if (!candidate || typeof candidate !== 'object' || !manifest || typeof manifest !== 'object') return ['candidate or manifest missing'];
  if (candidate.manifestId !== manifest.id) errors.push('candidate manifestId mismatch');
  if (candidate.bundleId !== manifest.dataset?.id) errors.push('candidate bundleId mismatch');
  if (candidate.datasetSha256 !== manifest.dataset?.fingerprint) errors.push('candidate dataset SHA-256 mismatch');
  if (candidate.artifactUri !== manifest.adapterUri) errors.push('candidate artifact URI mismatch');
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return [...errors, 'evidence section missing'];

  const receipt = evidence.handoffReceipt;
  if (receipt) {
    if (receipt.candidateId !== candidate.id || receipt.manifestId !== manifest.id) errors.push('handoff receipt identity mismatch');
    if (receipt.trainingResultSha256 !== candidate.trainingResultSha256) errors.push('handoff result SHA-256 mismatch');
    if (receipt.bundleId !== candidate.bundleId || receipt.datasetSha256 !== candidate.datasetSha256 || receipt.configSha256 !== candidate.configSha256) errors.push('handoff bundle fingerprint mismatch');
    if (!SHA256.test(receipt.handoffSha256 ?? '') || !SHA256.test(receipt.trainingResultSha256 ?? '')) errors.push('handoff SHA-256 malformed');
  }

  errors.push(...benchmarkErrors(evidence.latestBenchmark, manifest, 'latest'));
  const integrity = evidence.latestIntegrity;
  if (integrity) {
    if (integrity.candidateId !== candidate.id || integrity.manifestId !== manifest.id) errors.push('integrity identity mismatch');
    if (integrity.runtimeModel !== manifest.runtimeModel || integrity.artifactUri !== candidate.artifactUri) errors.push('integrity runtime/artifact mismatch');
    if (integrity.trainingResultSha256 !== candidate.trainingResultSha256) errors.push('integrity result SHA-256 mismatch');
    if (!SHA256.test(integrity.fingerprint ?? '') || !SHA256.test(integrity.baselineFingerprint ?? '')) errors.push('integrity fingerprint malformed');
  }

  const binding = evidence.latestArtifactBinding;
  if (binding) {
    if (binding.candidateId !== candidate.id || binding.manifestId !== manifest.id) errors.push('artifact binding identity mismatch');
    if (binding.trainingResultSha256 !== candidate.trainingResultSha256) errors.push('artifact binding result SHA-256 mismatch');
    if (binding.runtimeModel !== manifest.runtimeModel || binding.artifactUri !== candidate.artifactUri) errors.push('artifact binding runtime/artifact mismatch');
    if (receipt && (binding.handoffReceiptId !== receipt.id || binding.handoffSha256 !== receipt.handoffSha256)) errors.push('artifact binding handoff mismatch');
    if (!SHA256.test(binding.bindingSha256 ?? '') || !SHA256.test(binding.adapterFingerprint ?? '') || !SHA256.test(binding.baselineFingerprint ?? '')) errors.push('artifact binding fingerprint malformed');
  }

  const provenance = evidence.latestProvenance;
  if (provenance) {
    if (provenance.candidateId !== candidate.id || provenance.manifestId !== manifest.id) errors.push('signed provenance identity mismatch');
    if (provenance.runtimeModel !== manifest.runtimeModel || provenance.artifactUri !== candidate.artifactUri) errors.push('signed provenance runtime/artifact mismatch');
    if (provenance.trainingResultSha256 !== candidate.trainingResultSha256) errors.push('signed provenance result SHA-256 mismatch');
    if (!SHA256.test(provenance.payloadSha256 ?? '') || !SHA256.test(provenance.envelopeSha256 ?? '') || !SHA256.test(provenance.artifactFingerprint ?? '')) errors.push('signed provenance fingerprint malformed');
  }

  const signers = evidence.signerSummaries;
  if (!Array.isArray(signers)) errors.push('signer summaries missing');
  else {
    if (new Set(signers.map((item) => item.keyId)).size !== signers.length) errors.push('duplicate signer summary');
    if (provenance && !signers.some((item) => item.keyId === provenance.signerKeyId)) errors.push('latest provenance signer summary missing');
  }

  const promotion = evidence.promotion ?? {};
  errors.push(...benchmarkErrors(promotion.benchmark, manifest, 'promotion'));
  if (manifest.promotion) {
    if (!promotion.benchmark || promotion.benchmark.id !== manifest.promotion.benchmarkReportId) errors.push('promotion benchmark evidence missing');
    if (manifest.promotion.integrityEvidenceId && promotion.integrity?.id !== manifest.promotion.integrityEvidenceId) errors.push('promotion integrity evidence missing');
    if (manifest.promotion.artifactBindingEvidenceId && promotion.artifactBinding?.id !== manifest.promotion.artifactBindingEvidenceId) errors.push('promotion artifact binding evidence missing');
    if (manifest.promotion.provenanceEvidenceId && promotion.provenance?.id !== manifest.promotion.provenanceEvidenceId) errors.push('promotion signed provenance evidence missing');
  }
  return [...new Set(errors)];
}

function verifyPackage(pkg) {
  const errors = [];
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return { valid: false, errors: ['package must be a JSON object'] };
  if (pkg.schemaVersion !== 1) errors.push('unsupported schema');
  if (pkg.kind !== 'MIO_CANDIDATE_EVIDENCE_PACKAGE_V1') errors.push('unsupported kind');
  if (!Number.isSafeInteger(pkg.exportedAt) || pkg.exportedAt <= 0) errors.push('exportedAt invalid');
  if (!pkg.gates || typeof pkg.gates !== 'object' || Array.isArray(pkg.gates)) errors.push('gate snapshot missing');
  if (!pkg.disclosure?.trim() || pkg.disclosure.length > 1500) errors.push('disclosure invalid');
  if (!SHA256.test(pkg.packageSha256 ?? '')) errors.push('package SHA-256 malformed');
  errors.push(...schemaErrors(pkg), ...privacyErrors(pkg), ...identityErrors(pkg));
  const computed = sha256Hex(stableJsonStringify(packageBody(pkg)));
  if (SHA256.test(pkg.packageSha256 ?? '') && computed !== pkg.packageSha256) errors.push('package SHA-256 digest mismatch');
  return { valid: errors.length === 0, errors: [...new Set(errors)], packageSha256: computed, candidateId: pkg.candidate?.id, lifecycle: pkg.manifest?.lifecycle };
}

function readPackage(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_INPUT_BYTES) throw new Error('Candidate evidence package exceeds the 16 MiB verification limit');
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { throw new Error('Candidate evidence package is invalid JSON'); }
  return parsed;
}

function samplePackage() {
  const candidate = {
    schemaVersion: 1,
    id: 'candidate:test',
    manifestId: 'candidate:test',
    bundleId: 'mio-train-test',
    artifactUri: 'local-model://test/latest',
    trainingResultSha256: '1'.repeat(64),
    datasetSha256: '2'.repeat(64),
    configSha256: '3'.repeat(64),
    registeredAt: 1000,
    status: 'REGISTERED_UNEVALUATED',
  };
  const manifest = {
    schemaVersion: 1,
    id: candidate.manifestId,
    runtimeModel: 'mio-test:latest',
    displayName: 'Mio Test',
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
    kind: 'MIO_CANDIDATE_EVIDENCE_PACKAGE_V1',
    exportedAt: 2000,
    candidate,
    manifest,
    evidence: { signerSummaries: [], promotion: {} },
    gates: { releaseCandidateEligible: false, releaseBlockingReasons: ['not reviewed'], promotionEligible: false, promotionBlockingReasons: ['not release candidate'] },
    disclosure: 'Self-test portable governance evidence only.',
  };
  return { ...body, packageSha256: sha256Hex(stableJsonStringify(body)) };
}

function recompute(pkg) {
  return { ...pkg, packageSha256: sha256Hex(stableJsonStringify(packageBody(pkg))) };
}

function selfTest() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-candidate-evidence-'));
  try {
    const valid = samplePackage();
    const file = path.join(temp, 'candidate-evidence.json');
    fs.writeFileSync(file, JSON.stringify(valid));
    const verification = verifyPackage(readPackage(file));
    if (!verification.valid) throw new Error(`valid package rejected: ${verification.errors.join('; ')}`);

    const digestTamper = structuredClone(valid);
    digestTamper.packageSha256 = '0'.repeat(64);
    if (verifyPackage(digestTamper).valid) throw new Error('digest tampering was not blocked');

    const unknown = recompute({ ...valid, extraAuditPayload: 'unexpected' });
    if (verifyPackage(unknown).valid) throw new Error('unknown top-level field was not blocked');

    const sensitive = structuredClone(valid);
    sensitive.evidence.trainingJsonl = 'forbidden';
    sensitive.packageSha256 = sha256Hex(stableJsonStringify(packageBody(sensitive)));
    if (verifyPackage(sensitive).valid) throw new Error('forbidden training payload was not blocked');

    console.log('MIO CANDIDATE EVIDENCE PACKAGE SELF-TEST: PASS');
    console.log('No model loading, training, benchmark execution, network access, promotion, activation, or deployment occurred.');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === '--self-test') { values.selfTest = true; continue; }
    if (item === '--input') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('Missing value for --input');
      values.input = value;
      index += 1;
      continue;
    }
    throw new Error(`Unexpected argument: ${item}`);
  }
  return values;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    selfTest();
  } else if (args.input) {
    const verification = verifyPackage(readPackage(path.resolve(args.input)));
    console.log(JSON.stringify(verification, null, 2));
    if (!verification.valid) process.exitCode = 1;
  } else {
    console.error('Usage: node scripts/training/verify-candidate-evidence-package.mjs --input <candidate-evidence.json>');
    console.error('       node scripts/training/verify-candidate-evidence-package.mjs --self-test');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : 'Candidate evidence verification failed'}`);
  process.exitCode = 1;
}
