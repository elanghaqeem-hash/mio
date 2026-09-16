import { defaultStorageProvider } from '../storage/StorageRuntime';
import { StorageProvider } from '../storage/StorageProvider';
import { ModelProvider } from '../types/models';
import { BenchmarkReportRepository, StoredBenchmarkReport } from './BenchmarkReportRepository';
import { MIO_BENCH_CORE, MioBenchCase, MioBenchDomain, MioBenchReport, MioBenchRunner } from './MioBench';
import { MioModelManifest } from './ModelManifest';
import { ModelManifestRepository } from './ModelManifestRepository';
import { MioTrainingBundleManifest, sha256Hex, stableJsonStringify } from './TrainingBundle';

const NAMESPACE = 'training' as const;
const INDEX_KEY = 'training-candidate-index-v1';
const SAFE_URI = /^(training-artifact|workspace|local-model):\/\/[A-Za-z0-9._:/-]{1,512}$/;
const SAFE_RUNTIME_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,255}$/;

export interface MioTrainingResultArtifact {
  schemaVersion: 1;
  status: 'TRAINED_NOT_EVALUATED';
  promotionStatus: 'NOT_EVALUATED';
  bundleId: string;
  datasetSha256: string;
  configSha256: string;
  baseModel: string;
  targetModel: string;
  trainingMethod: 'LORA' | 'QLORA';
  trainedAt: string;
  exampleCount: number;
  nextRequiredGate: 'MioBench + ModelPromotionGate';
  disclosure?: string;
}

export type TrainingCandidateStatus =
  | 'REGISTERED_UNEVALUATED'
  | 'BENCHMARKED_POLICY_PASS'
  | 'BENCHMARKED_POLICY_FAIL';

export interface TrainingCandidateRecord {
  schemaVersion: 1;
  id: string;
  manifestId: string;
  bundleId: string;
  artifactUri: string;
  trainingResultSha256: string;
  datasetSha256: string;
  configSha256: string;
  registeredAt: number;
  status: TrainingCandidateStatus;
  latestBenchmarkReportId?: string;
  latestBenchmarkAt?: number;
}

export interface RegisterTrainingCandidateInput {
  bundle: MioTrainingBundleManifest;
  result: MioTrainingResultArtifact;
  runtimeModel: string;
  artifactUri: string;
  displayName?: string;
  benchmarkPolicy?: MioModelManifest['benchmarkPolicy'];
}

export interface CandidateBenchmarkEvaluation {
  candidate: TrainingCandidateRecord;
  manifest: MioModelManifest;
  storedReport: StoredBenchmarkReport;
  policyPassed: boolean;
  reasons: string[];
  metrics: {
    passRate: number;
    scoreRatio: number;
    averageLatencyMs: number;
    coveredDomains: MioBenchDomain[];
  };
}

export function validateTrainingResultArtifact(bundle: MioTrainingBundleManifest, result: MioTrainingResultArtifact): string[] {
  const errors: string[] = [];
  if (result.schemaVersion !== 1) errors.push('Unsupported training result schema');
  if (result.status !== 'TRAINED_NOT_EVALUATED') errors.push('Training result must be TRAINED_NOT_EVALUATED');
  if (result.promotionStatus !== 'NOT_EVALUATED') errors.push('Training result promotionStatus must be NOT_EVALUATED');
  if (result.nextRequiredGate !== 'MioBench + ModelPromotionGate') errors.push('Training result next gate contract is invalid');
  if (result.bundleId !== bundle.bundleId) errors.push('Training result bundleId does not match bundle manifest');
  if (result.datasetSha256 !== bundle.dataset.sha256) errors.push('Training result dataset fingerprint does not match bundle manifest');
  if (result.configSha256 !== bundle.reproducibility.configSha256) errors.push('Training result config fingerprint does not match bundle manifest');
  if (result.baseModel !== bundle.config.baseModel) errors.push('Training result base model does not match bundle config');
  if (result.targetModel !== bundle.config.targetModel) errors.push('Training result target model does not match bundle config');
  if (result.trainingMethod !== bundle.config.trainingMethod) errors.push('Training result method does not match bundle config');
  if (result.exampleCount !== bundle.dataset.exampleCount) errors.push('Training result example count does not match bundle manifest');
  const trainedAt = Date.parse(result.trainedAt);
  if (!Number.isFinite(trainedAt)) errors.push('Training result trainedAt is invalid');
  else if (trainedAt < bundle.generatedAt) errors.push('Training result predates its training bundle');
  return errors;
}

function defaultBenchmarkPolicy(bundle: MioTrainingBundleManifest): MioModelManifest['benchmarkPolicy'] {
  const supported = new Set<MioBenchDomain>(['GENERAL', 'REASONING', 'CODING', 'RESEARCH', 'TOOL_USE', 'SAFETY']);
  const requested = (bundle.config.requiredDomains ?? []).filter((domain): domain is MioBenchDomain => supported.has(domain as MioBenchDomain));
  const requiredDomains = requested.length > 0 ? [...new Set(requested)] : [...supported];
  return {
    minPassRate: 0.9,
    minScoreRatio: 0.9,
    requiredDomains,
  };
}

function benchmarkPolicyDecision(manifest: MioModelManifest, report: MioBenchReport): CandidateBenchmarkEvaluation['metrics'] & { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const passRate = report.passRate;
  const scoreRatio = report.maxScore > 0 ? report.score / report.maxScore : 0;
  const averageLatencyMs = report.results.length
    ? report.results.reduce((sum, result) => sum + result.latencyMs, 0) / report.results.length
    : Number.POSITIVE_INFINITY;
  const coveredDomains = [...new Set(report.results.filter((result) => result.passed).map((result) => result.domain))];

  if (passRate < manifest.benchmarkPolicy.minPassRate) reasons.push(`Pass rate ${passRate.toFixed(3)} is below ${manifest.benchmarkPolicy.minPassRate.toFixed(3)}`);
  if (scoreRatio < manifest.benchmarkPolicy.minScoreRatio) reasons.push(`Score ratio ${scoreRatio.toFixed(3)} is below ${manifest.benchmarkPolicy.minScoreRatio.toFixed(3)}`);
  for (const domain of manifest.benchmarkPolicy.requiredDomains) {
    if (!coveredDomains.includes(domain)) reasons.push(`Required benchmark domain '${domain}' has no passing result`);
  }
  if (manifest.benchmarkPolicy.maxAverageLatencyMs !== undefined && averageLatencyMs > manifest.benchmarkPolicy.maxAverageLatencyMs) {
    reasons.push(`Average latency ${Math.round(averageLatencyMs)}ms exceeds ${manifest.benchmarkPolicy.maxAverageLatencyMs}ms`);
  }
  return { passed: reasons.length === 0, reasons, passRate, scoreRatio, averageLatencyMs, coveredDomains };
}

export class TrainingCandidateRegistry {
  private readonly manifests: ModelManifestRepository;
  private readonly benchmarks: BenchmarkReportRepository;

  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {
    this.manifests = new ModelManifestRepository(storage);
    this.benchmarks = new BenchmarkReportRepository(storage);
  }

  public async register(input: RegisterTrainingCandidateInput): Promise<{ candidate: TrainingCandidateRecord; manifest: MioModelManifest }> {
    const errors = validateTrainingResultArtifact(input.bundle, input.result);
    if (errors.length) throw new Error(`Training candidate registration blocked: ${errors.join('; ')}`);
    const runtimeModel = input.runtimeModel.trim();
    const artifactUri = input.artifactUri.trim();
    if (!SAFE_RUNTIME_MODEL.test(runtimeModel)) throw new Error('Training candidate runtimeModel is invalid');
    if (!SAFE_URI.test(artifactUri)) throw new Error('Training candidate artifactUri must use training-artifact://, workspace://, or local-model://');

    const trainingResultSha256 = await sha256Hex(stableJsonStringify(input.result));
    const manifestId = `candidate:${input.bundle.bundleId}:${trainingResultSha256.slice(0, 12)}`;
    const existing = await this.manifests.get(manifestId);
    const manifest: MioModelManifest = existing ?? {
      schemaVersion: 1,
      id: manifestId,
      runtimeModel,
      displayName: input.displayName?.trim().slice(0, 200) || input.result.targetModel,
      baseModel: input.result.baseModel,
      trainingMethod: input.result.trainingMethod,
      adapterUri: artifactUri,
      createdAt: Date.parse(input.result.trainedAt),
      dataset: {
        id: input.bundle.bundleId,
        fingerprint: input.bundle.dataset.sha256,
        exampleCount: input.bundle.dataset.exampleCount,
      },
      benchmarkPolicy: input.benchmarkPolicy ?? defaultBenchmarkPolicy(input.bundle),
      review: {
        dataGovernanceReviewed: false,
        securityReviewed: false,
      },
      lifecycle: 'EXPERIMENTAL',
      notes: 'Registered from governed TP-0.46 training result. Benchmarking and explicit review are still required; registration is not promotion.',
    };

    if (existing && (existing.runtimeModel !== runtimeModel || existing.adapterUri !== artifactUri)) {
      throw new Error('Existing training candidate identity cannot be rebound to a different runtime model or artifact URI');
    }
    await this.manifests.save(manifest);

    const id = manifestId;
    const candidate: TrainingCandidateRecord = {
      schemaVersion: 1,
      id,
      manifestId,
      bundleId: input.bundle.bundleId,
      artifactUri,
      trainingResultSha256,
      datasetSha256: input.bundle.dataset.sha256,
      configSha256: input.bundle.reproducibility.configSha256,
      registeredAt: Date.now(),
      status: 'REGISTERED_UNEVALUATED',
    };
    const existingCandidate = await this.storage.get<TrainingCandidateRecord>(NAMESPACE, this.key(id));
    if (existingCandidate) {
      if (
        existingCandidate.trainingResultSha256 !== trainingResultSha256
        || existingCandidate.artifactUri !== artifactUri
        || existingCandidate.bundleId !== input.bundle.bundleId
      ) throw new Error('Existing training candidate record conflicts with this registration');
      return { candidate: existingCandidate, manifest };
    }
    await this.storage.set(NAMESPACE, this.key(id), candidate);
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    await this.storage.set(NAMESPACE, INDEX_KEY, [id, ...index.filter((item) => item !== id)].slice(0, 500));
    return { candidate: structuredClone(candidate), manifest };
  }

  public async get(id: string): Promise<TrainingCandidateRecord | undefined> {
    const value = await this.storage.get<TrainingCandidateRecord>(NAMESPACE, this.key(id));
    return value ? structuredClone(value) : undefined;
  }

  public async list(limit = 100): Promise<TrainingCandidateRecord[]> {
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    const output: TrainingCandidateRecord[] = [];
    for (const id of index.slice(0, Math.max(1, Math.min(limit, 500)))) {
      const record = await this.get(id);
      if (record) output.push(record);
    }
    return output;
  }

  public async evaluate(
    candidateId: string,
    provider: ModelProvider,
    cases: MioBenchCase[] = MIO_BENCH_CORE,
  ): Promise<CandidateBenchmarkEvaluation> {
    const candidate = await this.get(candidateId);
    if (!candidate) throw new Error(`Training candidate '${candidateId}' is not registered`);
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) throw new Error(`Model manifest '${candidate.manifestId}' is unavailable`);
    if (manifest.lifecycle !== 'EXPERIMENTAL') throw new Error(`Candidate lifecycle is ${manifest.lifecycle}; benchmark evaluation is only allowed while EXPERIMENTAL`);
    if (manifest.trainingMethod !== 'LORA' && manifest.trainingMethod !== 'QLORA') throw new Error(`Candidate training method '${manifest.trainingMethod}' is unsupported by the TP-0.47 registry`);

    const runner = new MioBenchRunner(provider);
    const report = await runner.run(manifest.runtimeModel, cases);
    const decision = benchmarkPolicyDecision(manifest, report);
    const storedReport = await this.benchmarks.save(manifest.id, report);
    const updated: TrainingCandidateRecord = {
      ...candidate,
      status: decision.passed ? 'BENCHMARKED_POLICY_PASS' : 'BENCHMARKED_POLICY_FAIL',
      latestBenchmarkReportId: storedReport.id,
      latestBenchmarkAt: storedReport.storedAt,
    };
    await this.storage.set(NAMESPACE, this.key(updated.id), updated);
    return { candidate: structuredClone(updated), manifest, storedReport, policyPassed: decision.passed, reasons: decision.reasons, metrics: decision };
  }

  private key(id: string): string {
    return `training-candidate:${id}`;
  }
}

export const trainingCandidateRegistry = new TrainingCandidateRegistry();
