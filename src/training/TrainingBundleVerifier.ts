import { MioTrainingDomain, MioTrainingLanguage, MioTrainingProvenanceKind } from './TrainingDataset';
import { MioTrainingBundle, sha256Hex, stableJsonStringify } from './TrainingBundle';

export interface TrainingBundleVerificationResult {
  valid: boolean;
  errors: string[];
  exampleCount: number;
  datasetSha256?: string;
  configSha256?: string;
}

interface ExportedTrainingRow {
  id?: string;
  domain?: MioTrainingDomain;
  language?: MioTrainingLanguage;
  messages?: Array<{ role?: string; content?: string }>;
  provenance?: { kind?: MioTrainingProvenanceKind };
}

function increment<T extends string>(record: Partial<Record<T, number>>, key: T): void {
  record[key] = (record[key] ?? 0) + 1;
}

function recordsEqual<T extends string>(
  left: Partial<Record<T, number>>,
  right: Partial<Record<T, number>>,
): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

export async function verifyTrainingBundle(bundle: MioTrainingBundle): Promise<TrainingBundleVerificationResult> {
  const errors: string[] = [];
  const manifest = bundle.manifest;

  if (manifest.schemaVersion !== 1) errors.push('Unsupported training bundle schema version');
  if (manifest.format !== 'MIO_CHAT_SFT_JSONL_V1') errors.push('Unsupported training bundle format');
  if (manifest.promotionStatus !== 'NOT_EVALUATED') errors.push('Training bundle must remain NOT_EVALUATED before MioBench and promotion review');
  if (manifest.files.trainingData !== 'train.jsonl' || manifest.files.manifest !== 'manifest.json') errors.push('Training bundle file contract is invalid');
  if (manifest.reproducibility.canonicalization !== 'stable-json-v1' || manifest.reproducibility.sortKey !== 'example.id') errors.push('Training bundle reproducibility contract is invalid');

  const datasetSha256 = await sha256Hex(bundle.trainingJsonl);
  if (datasetSha256 !== manifest.dataset.sha256 || datasetSha256 !== manifest.reproducibility.datasetSha256) {
    errors.push('Training dataset SHA-256 does not match manifest');
  }

  const configSha256 = await sha256Hex(stableJsonStringify(manifest.config));
  if (configSha256 !== manifest.reproducibility.configSha256) errors.push('Training config SHA-256 does not match manifest');

  const expectedBundleId = `mio-train-${datasetSha256.slice(0, 12)}-${configSha256.slice(0, 12)}`;
  if (manifest.bundleId !== expectedBundleId) errors.push('Training bundle id does not match dataset/config fingerprints');

  const rawLines = bundle.trainingJsonl ? bundle.trainingJsonl.split('\n') : [];
  const rows: ExportedTrainingRow[] = [];
  for (const [index, line] of rawLines.entries()) {
    try {
      rows.push(JSON.parse(line) as ExportedTrainingRow);
    } catch {
      errors.push(`Training JSONL line ${index + 1} is invalid JSON`);
    }
  }

  const ids: string[] = [];
  const countsByDomain: Partial<Record<MioTrainingDomain, number>> = {};
  const countsByLanguage: Partial<Record<MioTrainingLanguage, number>> = {};
  const countsByProvenance: Partial<Record<MioTrainingProvenanceKind, number>> = {};

  for (const [index, row] of rows.entries()) {
    if (!row.id?.trim()) errors.push(`Training JSONL line ${index + 1} has no id`);
    else ids.push(row.id);
    if (!row.domain) errors.push(`Training JSONL line ${index + 1} has no domain`);
    else increment(countsByDomain, row.domain);
    if (!row.language) errors.push(`Training JSONL line ${index + 1} has no language`);
    else increment(countsByLanguage, row.language);
    if (!row.provenance?.kind) errors.push(`Training JSONL line ${index + 1} has no provenance kind`);
    else increment(countsByProvenance, row.provenance.kind);
    if (!Array.isArray(row.messages) || row.messages.length < 2) errors.push(`Training JSONL line ${index + 1} has an invalid messages array`);
    else if (row.messages.at(-1)?.role !== 'assistant') errors.push(`Training JSONL line ${index + 1} does not end with an assistant response`);
  }

  if (new Set(ids).size !== ids.length) errors.push('Training JSONL contains duplicate example ids');
  if (rows.length !== manifest.dataset.exampleCount) errors.push('Training example count does not match manifest');
  if (stableJsonStringify(ids) !== stableJsonStringify(manifest.dataset.eligibleExampleIds)) errors.push('Training example id order does not match manifest');
  if (!recordsEqual(countsByDomain, manifest.dataset.countsByDomain)) errors.push('Domain counts do not match manifest');
  if (!recordsEqual(countsByLanguage, manifest.dataset.countsByLanguage)) errors.push('Language counts do not match manifest');
  if (!recordsEqual(countsByProvenance, manifest.dataset.countsByProvenance)) errors.push('Provenance counts do not match manifest');

  return {
    valid: errors.length === 0,
    errors,
    exampleCount: rows.length,
    datasetSha256,
    configSha256,
  };
}
