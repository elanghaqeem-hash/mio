import type { MioTrainingBundle, MioTrainingBundleManifest } from './TrainingBundle';
import { sha256Hex, stableJsonStringify } from './TrainingBundle';
import type { MioTrainingResultArtifact } from './TrainingCandidateRegistry';
import { validateTrainingResultArtifact } from './TrainingCandidateRegistry';
import { verifyTrainingBundle, type TrainingBundleVerificationResult } from './TrainingBundleVerifier';

const MAX_HANDOFF_JSON_CHARS = 64 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;

export interface MioTrainingRunHandoffBody {
  schemaVersion: 1;
  kind: 'MIO_TRAINING_RUN_HANDOFF_V1';
  createdAt: number;
  bundle: {
    manifest: MioTrainingBundleManifest;
    trainingJsonl: string;
  };
  result: MioTrainingResultArtifact;
  runner: {
    contract: 'TP-0.46';
    entrypoint: 'training/train_mio_lora.py';
    resultFile: 'mio-training-result.json';
  };
  fingerprints: {
    datasetSha256: string;
    configSha256: string;
    trainingResultSha256: string;
  };
  disclosure: string;
}

export interface MioTrainingRunHandoff extends MioTrainingRunHandoffBody {
  handoffSha256: string;
}

export interface TrainingRunHandoffVerification {
  valid: boolean;
  errors: string[];
  handoffCreatedAt?: number;
  handoffSha256?: string;
  trainingResultSha256?: string;
  bundleVerification?: TrainingBundleVerificationResult;
  bundle?: MioTrainingBundle;
  result?: MioTrainingResultArtifact;
}

function handoffBody(handoff: MioTrainingRunHandoff): MioTrainingRunHandoffBody {
  return {
    schemaVersion: handoff.schemaVersion,
    kind: handoff.kind,
    createdAt: handoff.createdAt,
    bundle: handoff.bundle,
    result: handoff.result,
    runner: handoff.runner,
    fingerprints: handoff.fingerprints,
    disclosure: handoff.disclosure,
  };
}

function parseHandoff(text: string): MioTrainingRunHandoff {
  if (!text.trim()) throw new Error('Training run handoff is empty');
  if (text.length > MAX_HANDOFF_JSON_CHARS) throw new Error('Training run handoff exceeds the 64 MiB import limit');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Training run handoff is invalid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Training run handoff must be a JSON object');
  return parsed as MioTrainingRunHandoff;
}

export async function verifyTrainingRunHandoff(text: string): Promise<TrainingRunHandoffVerification> {
  let handoff: MioTrainingRunHandoff;
  try {
    handoff = parseHandoff(text);
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : 'Training run handoff could not be parsed'] };
  }

  const errors: string[] = [];
  if (handoff.schemaVersion !== 1) errors.push('Unsupported training run handoff schema');
  if (handoff.kind !== 'MIO_TRAINING_RUN_HANDOFF_V1') errors.push('Unsupported training run handoff kind');
  if (!Number.isSafeInteger(handoff.createdAt) || handoff.createdAt <= 0) errors.push('Training run handoff createdAt is invalid');
  if (!handoff.bundle || typeof handoff.bundle !== 'object') errors.push('Training run handoff bundle is missing');
  if (!handoff.result || typeof handoff.result !== 'object') errors.push('Training run handoff result is missing');
  if (!handoff.runner || typeof handoff.runner !== 'object') errors.push('Training run handoff runner metadata is missing');
  if (!handoff.fingerprints || typeof handoff.fingerprints !== 'object') errors.push('Training run handoff fingerprints are missing');
  if (!SHA256.test(handoff.handoffSha256 ?? '')) errors.push('Training run handoff SHA-256 is malformed');
  if (!handoff.disclosure?.trim() || handoff.disclosure.length > 1000) errors.push('Training run handoff disclosure is invalid');

  if (handoff.runner) {
    if (handoff.runner.contract !== 'TP-0.46') errors.push('Training run handoff runner contract must be TP-0.46');
    if (handoff.runner.entrypoint !== 'training/train_mio_lora.py') errors.push('Training run handoff runner entrypoint is invalid');
    if (handoff.runner.resultFile !== 'mio-training-result.json') errors.push('Training run handoff result file contract is invalid');
  }

  const bundle = handoff.bundle?.manifest && typeof handoff.bundle.trainingJsonl === 'string'
    ? { manifest: handoff.bundle.manifest, trainingJsonl: handoff.bundle.trainingJsonl }
    : undefined;
  let bundleVerification: TrainingBundleVerificationResult | undefined;
  if (bundle) {
    try {
      bundleVerification = await verifyTrainingBundle(bundle);
      if (!bundleVerification.valid) errors.push(...bundleVerification.errors.map((error) => `Bundle: ${error}`));
    } catch (error) {
      errors.push(`Bundle verification failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  let trainingResultSha256: string | undefined;
  if (bundle && handoff.result) {
    errors.push(...validateTrainingResultArtifact(bundle.manifest, handoff.result).map((error) => `Result: ${error}`));
    trainingResultSha256 = await sha256Hex(stableJsonStringify(handoff.result));
    if (handoff.fingerprints?.trainingResultSha256 !== trainingResultSha256) errors.push('Training result SHA-256 does not match handoff fingerprint');
    if (handoff.fingerprints?.datasetSha256 !== bundle.manifest.dataset.sha256) errors.push('Handoff dataset SHA-256 does not match bundle manifest');
    if (handoff.fingerprints?.configSha256 !== bundle.manifest.reproducibility.configSha256) errors.push('Handoff config SHA-256 does not match bundle manifest');
    const trainedAt = Date.parse(handoff.result.trainedAt);
    if (Number.isFinite(trainedAt) && handoff.createdAt < trainedAt) errors.push('Training run handoff predates the training result');
  }

  let computedHandoffSha256: string | undefined;
  try {
    computedHandoffSha256 = await sha256Hex(stableJsonStringify(handoffBody(handoff)));
    if (SHA256.test(handoff.handoffSha256 ?? '') && handoff.handoffSha256 !== computedHandoffSha256) errors.push('Training run handoff SHA-256 digest mismatch');
  } catch (error) {
    errors.push(`Training run handoff digest could not be computed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    ...(Number.isSafeInteger(handoff.createdAt) && handoff.createdAt > 0 ? { handoffCreatedAt: handoff.createdAt } : {}),
    ...(computedHandoffSha256 ? { handoffSha256: computedHandoffSha256 } : {}),
    ...(trainingResultSha256 ? { trainingResultSha256 } : {}),
    ...(bundleVerification ? { bundleVerification } : {}),
    ...(bundle ? { bundle } : {}),
    ...(handoff.result ? { result: handoff.result } : {}),
  };
}

export async function buildTrainingRunHandoff(
  bundle: MioTrainingBundle,
  result: MioTrainingResultArtifact,
  createdAt = Date.now(),
): Promise<MioTrainingRunHandoff> {
  const bundleVerification = await verifyTrainingBundle(bundle);
  if (!bundleVerification.valid) throw new Error(`Training run handoff requires a verified bundle: ${bundleVerification.errors.join('; ')}`);
  const resultErrors = validateTrainingResultArtifact(bundle.manifest, result);
  if (resultErrors.length) throw new Error(`Training run handoff requires a valid result: ${resultErrors.join('; ')}`);
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0) throw new Error('Training run handoff createdAt must be a positive integer timestamp');
  const trainedAt = Date.parse(result.trainedAt);
  if (!Number.isFinite(trainedAt) || createdAt < trainedAt) throw new Error('Training run handoff createdAt cannot predate training completion');

  const trainingResultSha256 = await sha256Hex(stableJsonStringify(result));
  const body: MioTrainingRunHandoffBody = {
    schemaVersion: 1,
    kind: 'MIO_TRAINING_RUN_HANDOFF_V1',
    createdAt,
    bundle: structuredClone(bundle),
    result: structuredClone(result),
    runner: {
      contract: 'TP-0.46',
      entrypoint: 'training/train_mio_lora.py',
      resultFile: 'mio-training-result.json',
    },
    fingerprints: {
      datasetSha256: bundle.manifest.dataset.sha256,
      configSha256: bundle.manifest.reproducibility.configSha256,
      trainingResultSha256,
    },
    disclosure: 'This handoff proves consistency between the governed TP-0.46 training bundle and TRAINED_NOT_EVALUATED result. It does not prove adapter bytes, benchmark success, promotion, activation, deployment, publication, or model safety.',
  };
  const handoff: MioTrainingRunHandoff = {
    ...body,
    handoffSha256: await sha256Hex(stableJsonStringify(body)),
  };
  const verification = await verifyTrainingRunHandoff(JSON.stringify(handoff));
  if (!verification.valid) throw new Error(`Training run handoff self-verification failed: ${verification.errors.join('; ')}`);
  return structuredClone(handoff);
}
