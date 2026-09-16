import {
  isTrainingEligible,
  MioTrainingDomain,
  MioTrainingExample,
  MioTrainingLanguage,
  MioTrainingProvenanceKind,
  validateTrainingExample,
} from './TrainingDataset';

export type MioAdapterTrainingMethod = 'LORA' | 'QLORA';

export interface MioTrainingRunConfig {
  baseModel: string;
  targetModel: string;
  trainingMethod: MioAdapterTrainingMethod;
  seed: number;
  maxSequenceLength: number;
  learningRate: number;
  epochs: number;
  perDeviceTrainBatchSize: number;
  gradientAccumulationSteps: number;
  assistantOnlyLoss: boolean;
  packing: boolean;
  lora: {
    rank: number;
    alpha: number;
    dropout: number;
    targetModules?: string[];
  };
  requiredDomains?: MioTrainingDomain[];
  minExamples?: number;
}

export interface MioTrainingBundleManifest {
  schemaVersion: 1;
  format: 'MIO_CHAT_SFT_JSONL_V1';
  bundleId: string;
  generatedAt: number;
  promotionStatus: 'NOT_EVALUATED';
  config: MioTrainingRunConfig;
  dataset: {
    exampleCount: number;
    excludedCount: number;
    sha256: string;
    eligibleExampleIds: string[];
    excludedExamples: Array<{ id: string; reasons: string[] }>;
    countsByDomain: Partial<Record<MioTrainingDomain, number>>;
    countsByLanguage: Partial<Record<MioTrainingLanguage, number>>;
    countsByProvenance: Partial<Record<MioTrainingProvenanceKind, number>>;
  };
  reproducibility: {
    configSha256: string;
    datasetSha256: string;
    sortKey: 'example.id';
    canonicalization: 'stable-json-v1';
  };
  files: {
    trainingData: 'train.jsonl';
    manifest: 'manifest.json';
  };
}

export interface MioTrainingBundle {
  manifest: MioTrainingBundleManifest;
  trainingJsonl: string;
}

export interface TrainingBundleBuildOptions {
  generatedAt?: number;
}

export interface TrainingRunConfigValidation {
  valid: boolean;
  errors: string[];
}

const SAFE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,255}$/;
const DOMAINS: MioTrainingDomain[] = ['GENERAL', 'REASONING', 'CODING', 'RESEARCH', 'TOOL_USE', 'PROJECT_KNOWLEDGE', 'CREATIVE', 'SAFETY'];

export function validateTrainingRunConfig(config: MioTrainingRunConfig): TrainingRunConfigValidation {
  const errors: string[] = [];
  if (!SAFE_MODEL.test(config.baseModel.trim())) errors.push('baseModel is invalid');
  if (!SAFE_MODEL.test(config.targetModel.trim())) errors.push('targetModel is invalid');
  if (config.trainingMethod !== 'LORA' && config.trainingMethod !== 'QLORA') errors.push('trainingMethod must be LORA or QLORA');
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 2_147_483_647) errors.push('seed must be a non-negative 32-bit integer');
  if (!Number.isInteger(config.maxSequenceLength) || config.maxSequenceLength < 256 || config.maxSequenceLength > 131_072) errors.push('maxSequenceLength must be 256-131072');
  if (!Number.isFinite(config.learningRate) || config.learningRate <= 0 || config.learningRate > 0.01) errors.push('learningRate must be > 0 and <= 0.01');
  if (!Number.isFinite(config.epochs) || config.epochs <= 0 || config.epochs > 20) errors.push('epochs must be > 0 and <= 20');
  if (!Number.isInteger(config.perDeviceTrainBatchSize) || config.perDeviceTrainBatchSize < 1 || config.perDeviceTrainBatchSize > 128) errors.push('perDeviceTrainBatchSize must be 1-128');
  if (!Number.isInteger(config.gradientAccumulationSteps) || config.gradientAccumulationSteps < 1 || config.gradientAccumulationSteps > 512) errors.push('gradientAccumulationSteps must be 1-512');
  if (!Number.isInteger(config.lora.rank) || config.lora.rank < 1 || config.lora.rank > 512) errors.push('LoRA rank must be 1-512');
  if (!Number.isInteger(config.lora.alpha) || config.lora.alpha < 1 || config.lora.alpha > 2048) errors.push('LoRA alpha must be 1-2048');
  if (!Number.isFinite(config.lora.dropout) || config.lora.dropout < 0 || config.lora.dropout >= 1) errors.push('LoRA dropout must be >= 0 and < 1');
  if (config.lora.targetModules && (config.lora.targetModules.length === 0 || config.lora.targetModules.some((item) => !item.trim()))) errors.push('LoRA targetModules must contain non-empty module names when supplied');
  if (config.minExamples !== undefined && (!Number.isInteger(config.minExamples) || config.minExamples < 1 || config.minExamples > 10_000_000)) errors.push('minExamples must be a positive integer');
  const required = config.requiredDomains ?? [];
  if (required.some((domain) => !DOMAINS.includes(domain))) errors.push('requiredDomains contains an unsupported domain');
  if (new Set(required).size !== required.length) errors.push('requiredDomains must not contain duplicates');
  return { valid: errors.length === 0, errors };
}

function eligibilityReasons(example: MioTrainingExample): string[] {
  const reasons = [...validateTrainingExample(example).errors];
  if (!example.eligibility.trainingApproved) reasons.push('training approval is missing');
  if (!example.eligibility.privacyReviewed) reasons.push('privacy review is incomplete');
  if (!example.eligibility.copyrightReviewed) reasons.push('copyright review is incomplete');
  if (example.quality.factuality < 4) reasons.push('factuality quality is below 4');
  if (example.quality.instructionFollowing < 4) reasons.push('instruction-following quality is below 4');
  if (example.quality.safety < 4) reasons.push('safety quality is below 4');
  return [...new Set(reasons)];
}

function canonicalExample(example: MioTrainingExample): Record<string, unknown> {
  return {
    id: example.id,
    domain: example.domain,
    language: example.language,
    messages: example.messages.map((message) => ({ role: message.role, content: message.content })),
    provenance: {
      kind: example.provenance.kind,
      ...(example.provenance.sourceUri ? { sourceUri: example.provenance.sourceUri } : {}),
      ...(example.provenance.license ? { license: example.provenance.license } : {}),
      createdAt: example.provenance.createdAt,
      ...(example.provenance.reviewer ? { reviewer: example.provenance.reviewer } : {}),
    },
    tags: [...(example.tags ?? [])].sort(),
  };
}

export function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(object[key])}`).join(',')}}`;
}

export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 Web Crypto is unavailable in this runtime');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function increment<T extends string>(record: Partial<Record<T, number>>, key: T): void {
  record[key] = (record[key] ?? 0) + 1;
}

export async function buildTrainingBundle(
  examples: MioTrainingExample[],
  config: MioTrainingRunConfig,
  options: TrainingBundleBuildOptions = {},
): Promise<MioTrainingBundle> {
  const validation = validateTrainingRunConfig(config);
  if (!validation.valid) throw new Error(`Invalid training run config: ${validation.errors.join('; ')}`);

  const duplicateIds = examples.map((example) => example.id).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length > 0) throw new Error(`Duplicate training example ids are not allowed: ${[...new Set(duplicateIds)].join(', ')}`);

  const eligible = examples.filter(isTrainingEligible).sort((a, b) => a.id.localeCompare(b.id));
  const excluded = examples
    .filter((example) => !isTrainingEligible(example))
    .map((example) => ({ id: example.id, reasons: eligibilityReasons(example) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const minimum = config.minExamples ?? 1;
  if (eligible.length < minimum) throw new Error(`Training bundle requires at least ${minimum} eligible example(s); found ${eligible.length}`);

  const presentDomains = new Set(eligible.map((example) => example.domain));
  const missingDomains = (config.requiredDomains ?? []).filter((domain) => !presentDomains.has(domain));
  if (missingDomains.length > 0) throw new Error(`Training bundle is missing required domain(s): ${missingDomains.join(', ')}`);

  const trainingJsonl = eligible.map((example) => stableJsonStringify(canonicalExample(example))).join('\n');
  const datasetSha256 = await sha256Hex(trainingJsonl);
  const normalizedConfig: MioTrainingRunConfig = {
    ...config,
    baseModel: config.baseModel.trim(),
    targetModel: config.targetModel.trim(),
    lora: {
      ...config.lora,
      ...(config.lora.targetModules ? { targetModules: [...config.lora.targetModules].map((item) => item.trim()).sort() } : {}),
    },
    ...(config.requiredDomains ? { requiredDomains: [...config.requiredDomains].sort() as MioTrainingDomain[] } : {}),
  };
  const configSha256 = await sha256Hex(stableJsonStringify(normalizedConfig));
  const countsByDomain: Partial<Record<MioTrainingDomain, number>> = {};
  const countsByLanguage: Partial<Record<MioTrainingLanguage, number>> = {};
  const countsByProvenance: Partial<Record<MioTrainingProvenanceKind, number>> = {};
  for (const example of eligible) {
    increment(countsByDomain, example.domain);
    increment(countsByLanguage, example.language);
    increment(countsByProvenance, example.provenance.kind);
  }

  const manifest: MioTrainingBundleManifest = {
    schemaVersion: 1,
    format: 'MIO_CHAT_SFT_JSONL_V1',
    bundleId: `mio-train-${datasetSha256.slice(0, 12)}-${configSha256.slice(0, 12)}`,
    generatedAt: options.generatedAt ?? Date.now(),
    promotionStatus: 'NOT_EVALUATED',
    config: normalizedConfig,
    dataset: {
      exampleCount: eligible.length,
      excludedCount: excluded.length,
      sha256: datasetSha256,
      eligibleExampleIds: eligible.map((example) => example.id),
      excludedExamples: excluded,
      countsByDomain,
      countsByLanguage,
      countsByProvenance,
    },
    reproducibility: {
      configSha256,
      datasetSha256,
      sortKey: 'example.id',
      canonicalization: 'stable-json-v1',
    },
    files: { trainingData: 'train.jsonl', manifest: 'manifest.json' },
  };

  return { manifest, trainingJsonl };
}
