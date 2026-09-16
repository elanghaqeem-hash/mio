import { createLocalInferenceBackend } from '../intelligence/model/LocalInferenceBackend';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { defaultStorageProvider } from '../storage/StorageRuntime';
import { StorageProvider } from '../storage/StorageProvider';
import { LocalInferenceBackendId, ModelProvider } from '../types/models';
import { MIO_BENCH_CORE, MioBenchReport, MioBenchRunner } from './MioBench';
import { ModelManifestRepository } from './ModelManifestRepository';
import { MioTrainingBundle, MioTrainingBundleManifest } from './TrainingBundle';
import { TrainingBundleVerificationResult, verifyTrainingBundle } from './TrainingBundleVerifier';
import {
  CandidateBenchmarkEvaluation,
  MioTrainingResultArtifact,
  TrainingCandidateRecord,
  TrainingCandidateRegistry,
} from './TrainingCandidateRegistry';

const NAMESPACE = 'training' as const;
const COMPARISON_INDEX_KEY = 'candidate-lab-comparison-index-v1';
const MAX_IMPORT_CHARS = 64 * 1024 * 1024;
const SAFE_RUNTIME_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,255}$/;

export interface CandidateLabImportPreview {
  valid: boolean;
  errors: string[];
  manifest?: MioTrainingBundleManifest;
  result?: MioTrainingResultArtifact;
  bundleVerification?: TrainingBundleVerificationResult;
}

export interface RegisterCandidateImportInput {
  manifestJson: string;
  trainingJsonl: string;
  trainingResultJson: string;
  runtimeModel: string;
  artifactUri: string;
  displayName?: string;
}

export interface CandidateRuntimeReadiness {
  ready: boolean;
  candidateId: string;
  model: string;
  backend: LocalInferenceBackendId;
  detail: string;
}

export interface CandidateLabReportMetrics {
  passRate: number;
  scoreRatio: number;
  averageLatencyMs: number;
}

export interface CandidateLabComparisonRecord {
  schemaVersion: 1;
  id: string;
  candidateId: string;
  manifestId: string;
  backend: LocalInferenceBackendId;
  baseRuntimeModel: string;
  candidateRuntimeModel: string;
  createdAt: number;
  baseReport: MioBenchReport;
  candidateReport: MioBenchReport;
  candidateBenchmarkReportId: string;
  baseMetrics: CandidateLabReportMetrics;
  candidateMetrics: CandidateLabReportMetrics;
  delta: CandidateLabReportMetrics;
  disclosure: string;
}

export interface RunCandidateBenchmarkInput {
  candidateId: string;
  backend: LocalInferenceBackendId;
  endpoint?: string;
  timeoutMs?: number;
}

export interface RunCandidateComparisonInput extends RunCandidateBenchmarkInput {
  baseRuntimeModel: string;
}

export type CandidateLabProviderFactory = (
  model: string,
  backend: LocalInferenceBackendId,
  endpoint?: string,
) => ModelProvider;

export type CandidateLabReadinessChecker = (
  model: string,
  backend: LocalInferenceBackendId,
  endpoint: string | undefined,
  timeoutMs: number,
) => Promise<{ ready: boolean; detail: string }>;

const defaultProviderFactory: CandidateLabProviderFactory = (model, backendId, endpoint) => {
  const backend = createLocalInferenceBackend(backendId, endpoint, model);
  return {
    id: 'mio_local',
    displayName: `MIO Candidate Lab (${backend.displayName})`,
    requiresNetwork: false,
    requiresProxy: false,
    async generate(request, signal) {
      const local = await backend.chat(request.messages, request, signal);
      return {
        provider: 'mio_local',
        model: local.model,
        text: local.text,
        usage: { inputTokens: local.inputTokens, outputTokens: local.outputTokens },
        finishReason: local.finishReason,
        generatedAt: Date.now(),
        source: 'LOCAL_ENDPOINT',
        webSearchUsed: false,
        citations: [],
      };
    },
  };
};

const defaultReadinessChecker: CandidateLabReadinessChecker = async (model, backendId, endpoint, timeoutMs) => {
  const backend = createLocalInferenceBackend(backendId, endpoint, model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, Math.min(timeoutMs, 30_000)));
  try {
    const readiness = await backend.checkReadiness(controller.signal);
    return { ready: readiness.ready, detail: `${backend.displayName}: ${readiness.detail}` };
  } catch (error) {
    return { ready: false, detail: error instanceof Error ? error.message : 'Local candidate readiness check failed' };
  } finally {
    clearTimeout(timer);
  }
};

function parseObject(text: string, label: string): { value?: Record<string, unknown>; error?: string } {
  if (!text.trim()) return { error: `${label} is empty` };
  if (text.length > MAX_IMPORT_CHARS) return { error: `${label} exceeds the ${Math.floor(MAX_IMPORT_CHARS / 1024 / 1024)} MiB Candidate Lab import limit` };
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: `${label} must contain a JSON object` };
    return { value: value as Record<string, unknown> };
  } catch (error) {
    return { error: `${label} is invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}` };
  }
}

function manifestShapeErrors(value: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!value.config || typeof value.config !== 'object' || Array.isArray(value.config)) errors.push('Bundle manifest config object is missing');
  if (!value.dataset || typeof value.dataset !== 'object' || Array.isArray(value.dataset)) errors.push('Bundle manifest dataset object is missing');
  if (!value.reproducibility || typeof value.reproducibility !== 'object' || Array.isArray(value.reproducibility)) errors.push('Bundle manifest reproducibility object is missing');
  if (!value.files || typeof value.files !== 'object' || Array.isArray(value.files)) errors.push('Bundle manifest files object is missing');
  return errors;
}

function resultShapeErrors(value: Record<string, unknown>): string[] {
  const required = [
    'schemaVersion', 'status', 'promotionStatus', 'bundleId', 'datasetSha256', 'configSha256',
    'baseModel', 'targetModel', 'trainingMethod', 'trainedAt', 'exampleCount', 'nextRequiredGate',
  ];
  return required.filter((key) => value[key] === undefined).map((key) => `Training result field '${key}' is missing`);
}

function metrics(report: MioBenchReport): CandidateLabReportMetrics {
  return {
    passRate: report.passRate,
    scoreRatio: report.maxScore > 0 ? report.score / report.maxScore : 0,
    averageLatencyMs: report.results.length > 0
      ? report.results.reduce((sum, result) => sum + result.latencyMs, 0) / report.results.length
      : Number.POSITIVE_INFINITY,
  };
}

function metricDelta(candidate: CandidateLabReportMetrics, base: CandidateLabReportMetrics): CandidateLabReportMetrics {
  return {
    passRate: candidate.passRate - base.passRate,
    scoreRatio: candidate.scoreRatio - base.scoreRatio,
    averageLatencyMs: candidate.averageLatencyMs - base.averageLatencyMs,
  };
}

export class TrainingCandidateLabService {
  private readonly candidates: TrainingCandidateRegistry;
  private readonly manifests: ModelManifestRepository;

  constructor(
    private readonly storage: StorageProvider = defaultStorageProvider,
    private readonly providerFactory: CandidateLabProviderFactory = defaultProviderFactory,
    private readonly readinessChecker: CandidateLabReadinessChecker = defaultReadinessChecker,
  ) {
    this.candidates = new TrainingCandidateRegistry(storage);
    this.manifests = new ModelManifestRepository(storage);
  }

  public async previewImport(manifestJson: string, trainingJsonl: string, trainingResultJson: string): Promise<CandidateLabImportPreview> {
    const errors: string[] = [];
    if (trainingJsonl.length > MAX_IMPORT_CHARS) errors.push(`train.jsonl exceeds the ${Math.floor(MAX_IMPORT_CHARS / 1024 / 1024)} MiB Candidate Lab import limit`);

    const manifestParsed = parseObject(manifestJson, 'manifest.json');
    const resultParsed = parseObject(trainingResultJson, 'mio-training-result.json');
    if (manifestParsed.error) errors.push(manifestParsed.error);
    if (resultParsed.error) errors.push(resultParsed.error);
    if (!manifestParsed.value || !resultParsed.value || errors.length > 0) return { valid: false, errors };

    errors.push(...manifestShapeErrors(manifestParsed.value));
    errors.push(...resultShapeErrors(resultParsed.value));
    if (errors.length > 0) return { valid: false, errors };

    const manifest = manifestParsed.value as unknown as MioTrainingBundleManifest;
    const result = resultParsed.value as unknown as MioTrainingResultArtifact;
    const bundle: MioTrainingBundle = { manifest, trainingJsonl };
    let bundleVerification: TrainingBundleVerificationResult | undefined;
    try {
      bundleVerification = await verifyTrainingBundle(bundle);
      errors.push(...bundleVerification.errors);
    } catch (error) {
      errors.push(`Training bundle verification failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    if (bundleVerification?.valid) {
      try {
        const previewRegistry = new TrainingCandidateRegistry(new InMemoryStorageProvider());
        await previewRegistry.register({
          bundle: manifest,
          result,
          runtimeModel: manifest.config.targetModel,
          artifactUri: 'training-artifact://candidate-lab-preview',
          displayName: manifest.config.targetModel,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Training result binding validation failed');
      }
    }

    return {
      valid: errors.length === 0,
      errors: [...new Set(errors)],
      manifest,
      result,
      bundleVerification,
    };
  }

  public async registerImport(input: RegisterCandidateImportInput): Promise<{ candidate: TrainingCandidateRecord }> {
    const preview = await this.previewImport(input.manifestJson, input.trainingJsonl, input.trainingResultJson);
    if (!preview.valid || !preview.manifest || !preview.result) {
      throw new Error(`Candidate Lab import blocked: ${preview.errors.join('; ') || 'import verification failed'}`);
    }
    const registered = await this.candidates.register({
      bundle: preview.manifest,
      result: preview.result,
      runtimeModel: input.runtimeModel,
      artifactUri: input.artifactUri,
      displayName: input.displayName,
    });
    return { candidate: registered.candidate };
  }

  public async checkCandidateReadiness(
    candidateId: string,
    backend: LocalInferenceBackendId,
    endpoint?: string,
    timeoutMs = 8_000,
  ): Promise<CandidateRuntimeReadiness> {
    const candidate = await this.candidates.get(candidateId);
    if (!candidate) throw new Error(`Training candidate '${candidateId}' is not registered`);
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) throw new Error(`Model manifest '${candidate.manifestId}' is missing`);
    const readiness = await this.readinessChecker(manifest.runtimeModel, backend, endpoint, timeoutMs);
    return {
      ready: readiness.ready,
      candidateId,
      model: manifest.runtimeModel,
      backend,
      detail: readiness.detail,
    };
  }

  public async runCandidateBenchmark(input: RunCandidateBenchmarkInput): Promise<CandidateBenchmarkEvaluation> {
    const readiness = await this.checkCandidateReadiness(input.candidateId, input.backend, input.endpoint, input.timeoutMs ?? 8_000);
    if (!readiness.ready) throw new Error(`Candidate runtime is not ready: ${readiness.detail}`);
    const candidate = await this.candidates.get(input.candidateId);
    if (!candidate) throw new Error(`Training candidate '${input.candidateId}' is not registered`);
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) throw new Error(`Model manifest '${candidate.manifestId}' is missing`);
    const provider = this.providerFactory(manifest.runtimeModel, input.backend, input.endpoint);
    return this.candidates.evaluate(input.candidateId, provider, MIO_BENCH_CORE);
  }

  public async runComparison(input: RunCandidateComparisonInput): Promise<CandidateLabComparisonRecord> {
    const candidate = await this.candidates.get(input.candidateId);
    if (!candidate) throw new Error(`Training candidate '${input.candidateId}' is not registered`);
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) throw new Error(`Model manifest '${candidate.manifestId}' is missing`);

    const baseRuntimeModel = input.baseRuntimeModel.trim();
    if (!SAFE_RUNTIME_MODEL.test(baseRuntimeModel)) throw new Error('Base runtime model alias is invalid');

    const timeoutMs = input.timeoutMs ?? 8_000;
    const [baseReady, candidateReady] = await Promise.all([
      this.readinessChecker(baseRuntimeModel, input.backend, input.endpoint, timeoutMs),
      this.readinessChecker(manifest.runtimeModel, input.backend, input.endpoint, timeoutMs),
    ]);
    if (!baseReady.ready) throw new Error(`Base runtime is not ready: ${baseReady.detail}`);
    if (!candidateReady.ready) throw new Error(`Candidate runtime is not ready: ${candidateReady.detail}`);

    const baseProvider = this.providerFactory(baseRuntimeModel, input.backend, input.endpoint);
    const baseReport = await new MioBenchRunner(MIO_BENCH_CORE).run(baseProvider);
    if (baseReport.model !== baseRuntimeModel) {
      throw new Error(`Base benchmark model identity mismatch: '${baseReport.model}' does not match requested '${baseRuntimeModel}'`);
    }

    const candidateEvaluation = await this.candidates.evaluate(
      candidate.id,
      this.providerFactory(manifest.runtimeModel, input.backend, input.endpoint),
      MIO_BENCH_CORE,
    );
    const baseMetrics = metrics(baseReport);
    const candidateMetrics = metrics(candidateEvaluation.storedReport.report);
    const createdAt = Date.now();
    const comparison: CandidateLabComparisonRecord = {
      schemaVersion: 1,
      id: `candidate-comparison:${candidate.id}:${createdAt}`,
      candidateId: candidate.id,
      manifestId: candidate.manifestId,
      backend: input.backend,
      baseRuntimeModel,
      candidateRuntimeModel: manifest.runtimeModel,
      createdAt,
      baseReport: structuredClone(baseReport),
      candidateReport: structuredClone(candidateEvaluation.storedReport.report),
      candidateBenchmarkReportId: candidateEvaluation.storedReport.id,
      baseMetrics,
      candidateMetrics,
      delta: metricDelta(candidateMetrics, baseMetrics),
      disclosure: 'This comparison is bounded MioBench evidence only. It does not prove general model superiority and does not promote or activate the candidate.',
    };
    await this.saveComparison(comparison);
    return comparison;
  }

  public async latestComparison(candidateId: string): Promise<CandidateLabComparisonRecord | undefined> {
    const index = await this.storage.get<string[]>(NAMESPACE, COMPARISON_INDEX_KEY) ?? [];
    for (const id of index) {
      const record = await this.storage.get<CandidateLabComparisonRecord>(NAMESPACE, id);
      if (record?.candidateId === candidateId) return record;
    }
    return undefined;
  }

  private async saveComparison(comparison: CandidateLabComparisonRecord): Promise<void> {
    await this.storage.set(NAMESPACE, comparison.id, structuredClone(comparison));
    const index = await this.storage.get<string[]>(NAMESPACE, COMPARISON_INDEX_KEY) ?? [];
    await this.storage.set(NAMESPACE, COMPARISON_INDEX_KEY, [comparison.id, ...index.filter((id) => id !== comparison.id)].slice(0, 1_000));
  }
}

export const trainingCandidateLabService = new TrainingCandidateLabService();
