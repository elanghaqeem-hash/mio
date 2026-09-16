#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const KIND = 'MIO_TRAINING_RUN_HANDOFF_V1';
const BUNDLE_FORMAT = 'MIO_CHAT_SFT_JSONL_V1';

function stableJsonStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(',')}}`;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function readBoundedText(filePath, label) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_INPUT_BYTES) throw new Error(`${label} exceeds the 64 MiB handoff packaging limit`);
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath, label) {
  let parsed;
  try { parsed = JSON.parse(readBoundedText(filePath, label)); }
  catch (error) { throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function validateBundle(manifest, trainingJsonl) {
  requireCondition(manifest.schemaVersion === 1, 'Unsupported training bundle schema');
  requireCondition(manifest.format === BUNDLE_FORMAT, 'Unsupported training bundle format');
  requireCondition(manifest.promotionStatus === 'NOT_EVALUATED', 'Training bundle must remain NOT_EVALUATED');
  requireCondition(manifest.files?.trainingData === 'train.jsonl' && manifest.files?.manifest === 'manifest.json', 'Training bundle file contract is invalid');
  requireCondition(manifest.reproducibility?.canonicalization === 'stable-json-v1' && manifest.reproducibility?.sortKey === 'example.id', 'Training bundle reproducibility contract is invalid');
  const datasetSha256 = sha256Hex(trainingJsonl);
  const configSha256 = sha256Hex(stableJsonStringify(manifest.config));
  requireCondition(datasetSha256 === manifest.dataset?.sha256 && datasetSha256 === manifest.reproducibility?.datasetSha256, 'Training dataset SHA-256 does not match manifest');
  requireCondition(configSha256 === manifest.reproducibility?.configSha256, 'Training config SHA-256 does not match manifest');
  requireCondition(manifest.bundleId === `mio-train-${datasetSha256.slice(0, 12)}-${configSha256.slice(0, 12)}`, 'Training bundle id does not match fingerprints');
  const lines = trainingJsonl ? trainingJsonl.split('\n') : [];
  requireCondition(lines.length === manifest.dataset?.exampleCount, 'Training example count does not match manifest');
  const ids = lines.map((line, index) => {
    let row;
    try { row = JSON.parse(line); } catch { throw new Error(`Training JSONL line ${index + 1} is invalid JSON`); }
    requireCondition(row && typeof row === 'object' && !Array.isArray(row), `Training JSONL line ${index + 1} must be an object`);
    requireCondition(typeof row.id === 'string' && row.id.trim(), `Training JSONL line ${index + 1} has no id`);
    requireCondition(Array.isArray(row.messages) && row.messages.length >= 2 && row.messages.at(-1)?.role === 'assistant', `Training JSONL line ${index + 1} has invalid messages`);
    return row.id;
  });
  requireCondition(new Set(ids).size === ids.length, 'Training JSONL contains duplicate ids');
  requireCondition(stableJsonStringify(ids) === stableJsonStringify(manifest.dataset.eligibleExampleIds), 'Training example id order does not match manifest');
  return { datasetSha256, configSha256 };
}

function validateResult(manifest, result) {
  const errors = [];
  if (result.schemaVersion !== 1) errors.push('unsupported result schema');
  if (result.status !== 'TRAINED_NOT_EVALUATED') errors.push('status must be TRAINED_NOT_EVALUATED');
  if (result.promotionStatus !== 'NOT_EVALUATED') errors.push('promotionStatus must be NOT_EVALUATED');
  if (result.nextRequiredGate !== 'MioBench + ModelPromotionGate') errors.push('next gate contract is invalid');
  if (result.bundleId !== manifest.bundleId) errors.push('bundleId mismatch');
  if (result.datasetSha256 !== manifest.dataset.sha256) errors.push('dataset SHA mismatch');
  if (result.configSha256 !== manifest.reproducibility.configSha256) errors.push('config SHA mismatch');
  if (result.baseModel !== manifest.config.baseModel) errors.push('base model mismatch');
  if (result.targetModel !== manifest.config.targetModel) errors.push('target model mismatch');
  if (result.trainingMethod !== manifest.config.trainingMethod) errors.push('training method mismatch');
  if (result.exampleCount !== manifest.dataset.exampleCount) errors.push('example count mismatch');
  const trainedAt = Date.parse(result.trainedAt);
  if (!Number.isFinite(trainedAt)) errors.push('trainedAt is invalid');
  else if (trainedAt < manifest.generatedAt) errors.push('training result predates bundle');
  if (errors.length) throw new Error(`Training result validation failed: ${errors.join('; ')}`);
}

function buildHandoff(manifest, trainingJsonl, result, createdAt = Date.now()) {
  const hashes = validateBundle(manifest, trainingJsonl);
  validateResult(manifest, result);
  const trainedAt = Date.parse(result.trainedAt);
  requireCondition(Number.isSafeInteger(createdAt) && createdAt > 0, 'Handoff createdAt must be a positive integer timestamp');
  requireCondition(createdAt >= trainedAt, 'Handoff createdAt cannot predate training completion');
  const trainingResultSha256 = sha256Hex(stableJsonStringify(result));
  const body = {
    schemaVersion: 1,
    kind: KIND,
    createdAt,
    bundle: { manifest, trainingJsonl },
    result,
    runner: {
      contract: 'TP-0.46',
      entrypoint: 'training/train_mio_lora.py',
      resultFile: 'mio-training-result.json',
    },
    fingerprints: {
      datasetSha256: hashes.datasetSha256,
      configSha256: hashes.configSha256,
      trainingResultSha256,
    },
    disclosure: 'This handoff proves consistency between the governed TP-0.46 training bundle and TRAINED_NOT_EVALUATED result. It does not prove adapter bytes, benchmark success, promotion, activation, deployment, publication, or model safety.',
  };
  return { ...body, handoffSha256: sha256Hex(stableJsonStringify(body)) };
}

function packageFromPaths(bundleDir, resultPath, outputPath, createdAt) {
  const manifest = readJson(path.join(bundleDir, 'manifest.json'), 'manifest.json');
  const trainingJsonl = readBoundedText(path.join(bundleDir, 'train.jsonl'), 'train.jsonl');
  const result = readJson(resultPath, 'mio-training-result.json');
  const handoff = buildHandoff(manifest, trainingJsonl, result, createdAt);
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  if (fs.existsSync(outputPath)) throw new Error(`Refusing to overwrite existing handoff without removing it first: ${outputPath}`);
  fs.writeFileSync(outputPath, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return handoff;
}

function selfTest() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-handoff-selftest-'));
  try {
    const bundleDir = path.join(temp, 'bundle');
    const resultDir = path.join(temp, 'result');
    fs.mkdirSync(bundleDir);
    fs.mkdirSync(resultDir);
    const row = { id: 'handoff:selftest:001', domain: 'GENERAL', language: 'id', messages: [{ role: 'user', content: 'test' }, { role: 'assistant', content: 'ok' }], provenance: { kind: 'SYNTHETIC', createdAt: 1 }, tags: [] };
    const trainingJsonl = stableJsonStringify(row);
    const config = { baseModel: 'Qwen/Qwen3-8B', targetModel: 'Mio-Local-8B-handoff-selftest', trainingMethod: 'QLORA', seed: 42, maxSequenceLength: 4096, learningRate: 0.0002, epochs: 1, perDeviceTrainBatchSize: 1, gradientAccumulationSteps: 8, assistantOnlyLoss: true, packing: false, lora: { rank: 16, alpha: 32, dropout: 0.05 }, requiredDomains: ['GENERAL'], minExamples: 1 };
    const datasetSha256 = sha256Hex(trainingJsonl);
    const configSha256 = sha256Hex(stableJsonStringify(config));
    const manifest = {
      schemaVersion: 1,
      format: BUNDLE_FORMAT,
      bundleId: `mio-train-${datasetSha256.slice(0, 12)}-${configSha256.slice(0, 12)}`,
      generatedAt: 1000,
      promotionStatus: 'NOT_EVALUATED',
      config,
      dataset: { exampleCount: 1, excludedCount: 0, sha256: datasetSha256, eligibleExampleIds: [row.id], excludedExamples: [], countsByDomain: { GENERAL: 1 }, countsByLanguage: { id: 1 }, countsByProvenance: { SYNTHETIC: 1 } },
      reproducibility: { configSha256, datasetSha256, sortKey: 'example.id', canonicalization: 'stable-json-v1' },
      files: { trainingData: 'train.jsonl', manifest: 'manifest.json' },
    };
    const result = { schemaVersion: 1, status: 'TRAINED_NOT_EVALUATED', promotionStatus: 'NOT_EVALUATED', bundleId: manifest.bundleId, datasetSha256, configSha256, baseModel: config.baseModel, targetModel: config.targetModel, trainingMethod: config.trainingMethod, trainedAt: new Date(2000).toISOString(), exampleCount: 1, nextRequiredGate: 'MioBench + ModelPromotionGate' };
    fs.writeFileSync(path.join(bundleDir, 'manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(bundleDir, 'train.jsonl'), trainingJsonl);
    const resultPath = path.join(resultDir, 'mio-training-result.json');
    fs.writeFileSync(resultPath, JSON.stringify(result));
    const outputPath = path.join(resultDir, 'mio-training-handoff.json');
    const handoff = packageFromPaths(bundleDir, resultPath, outputPath, 3000);
    requireCondition(fs.existsSync(outputPath), 'Self-test handoff file was not written');
    requireCondition(handoff.kind === KIND && /^[a-f0-9]{64}$/.test(handoff.handoffSha256), 'Self-test handoff contract is invalid');
    const tampered = structuredClone(result);
    tampered.bundleId = 'tampered';
    let tamperBlocked = false;
    try { buildHandoff(manifest, trainingJsonl, tampered, 3000); } catch { tamperBlocked = true; }
    requireCondition(tamperBlocked, 'Self-test failed to block result tampering');
    console.log('MIO TRAINING RUN HANDOFF SELF-TEST: PASS');
    console.log('No ML dependency import, model download, training, benchmark, promotion, activation, upload, or deployment occurred.');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (!item.startsWith('--')) throw new Error(`Unexpected argument: ${item}`);
    if (item === '--self-test') { values.selfTest = true; continue; }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${item}`);
    values[item.slice(2)] = value;
    index += 1;
  }
  return values;
}

const args = parseArgs(process.argv.slice(2));
if (args.selfTest) {
  selfTest();
  process.exit(0);
}
if (!args.bundle || !args.result || !args.output) {
  console.error('Usage: node scripts/training/create-training-run-handoff.mjs --bundle <bundle-dir> --result <mio-training-result.json> --output <mio-training-handoff.json> [--created-at <ms>]');
  console.error('       node scripts/training/create-training-run-handoff.mjs --self-test');
  process.exit(2);
}
try {
  const createdAt = args['created-at'] ? Number(args['created-at']) : Date.now();
  const handoff = packageFromPaths(path.resolve(args.bundle), path.resolve(args.result), path.resolve(args.output), createdAt);
  console.log(JSON.stringify({ state: 'HANDOFF_CREATED', kind: handoff.kind, handoffSha256: handoff.handoffSha256, output: path.resolve(args.output) }, null, 2));
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : 'Training run handoff packaging failed'}`);
  process.exit(1);
}
