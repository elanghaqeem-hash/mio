import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import { BenchmarkReportRepository, type StoredBenchmarkReport } from './BenchmarkReportRepository';
import type { MioModelManifest } from './ModelManifest';
import { ModelManifestRepository } from './ModelManifestRepository';
import { ModelPromotionService } from './ModelPromotionService';
import {
  ModelSignerTrustStore,
  TrainingCandidateProvenanceService,
  type CandidateSignedProvenanceEvidence,
  type ModelSignerTrustStatus,
} from './SignedModelArtifactProvenance';
import {
  TrainingArtifactBindingService,
  type TrainingArtifactBindingEvidence,
} from './TrainingArtifactBindingService';
import { sha256Hex, stableJsonStringify } from './TrainingBundle';
import type { TrainingCandidateRecord } from './TrainingCandidateRegistry';
import { TrainingCandidateRegistry } from './TrainingCandidateRegistry';
import {
  TrainingCandidateIntegrityService,
  type CandidateAdapterIntegrityEvidence,
} from './TrainingCandidateIntegrityService';
import { TrainingCandidateReviewService } from './TrainingCandidateReviewService';
import {
  TrainingRunHandoffService,
  type TrainingRunHandoffReceipt,
} from './TrainingRunHandoffService';

const MAX_PACKAGE_CHARS = 16 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'kind', 'exportedAt', 'candidate', 'manifest', 'evidence', 'gates', 'disclosure', 'packageSha256']);
const EVIDENCE_KEYS = new Set(['handoffReceipt', 'latestBenchmark', 'latestIntegrity', 'latestArtifactBinding', 'latestProvenance', 'signerSummaries', 'promotion']);
const PROMOTION_KEYS = new Set(['benchmark', 'integrity', 'artifactBinding', 'provenance']);
const GATE_KEYS = new Set(['releaseCandidateEligible', 'releaseBlockingReasons', 'promotionEligible', 'promotionBlockingReasons']);
const FORBIDDEN_PORTABLE_KEYS = new Set([
  'trainingjsonl',
  'trainjsonl',
  'messages',
  'privatekey',
  'privatekeypem',
  'secret',
  'secrets',
  'token',
  'accesstoken',
  'refreshtoken',
  'credential',
  'credentials',
  'authorization',
  'permissiongrant',
  'permissiongrants',
  'modelweights',
  'adapterbytes',
  'rawweights',
]);

export interface CandidateEvidenceSignerSummary {
  keyId: string;
  label: string;
  status: ModelSignerTrustStatus;
  trustedAt: number;
  revokedAt?: number;
}

export interface CandidateEvidenceBenchmarkCaseSummary {
  id: string;
  domain: string;
  score: number;
  maxScore: number;
  passed: boolean;
  latencyMs: number;
}

export interface CandidateEvidenceBenchmarkSummary {
  id: string;
  manifestId: string;
  recordedAt: number;
  sourceReportSha256: string;
  provider: string;
  model: string;
  generatedAt: number;
  score: number;
  maxScore: number;
  passRate: number;
  results: CandidateEvidenceBenchmarkCaseSummary[];
}

export interface CandidateEvidencePromotionArtifacts {
  benchmark?: CandidateEvidenceBenchmarkSummary;
  integrity?: CandidateAdapterIntegrityEvidence;
  artifactBinding?: TrainingArtifactBindingEvidence;
  provenance?: CandidateSignedProvenanceEvidence;
}

export interface CandidateEvidenceGateSnapshot {
  releaseCandidateEligible: boolean;
  releaseBlockingReasons: string[];
  promotionEligible: boolean;
  promotionBlockingReasons: string[];
}

export interface MioCandidateEvidencePackageBody {
  schemaVersion: 1;
  kind: 'MIO_CANDIDATE_EVIDENCE_PACKAGE_V1';
  exportedAt: number;
  candidate: TrainingCandidateRecord;
  manifest: MioModelManifest;
  evidence: {
    handoffReceipt?: TrainingRunHandoffReceipt;
    latestBenchmark?: CandidateEvidenceBenchmarkSummary;
    latestIntegrity?: CandidateAdapterIntegrityEvidence;
    latestArtifactBinding?: TrainingArtifactBindingEvidence;
    latestProvenance?: CandidateSignedProvenanceEvidence;
    signerSummaries: CandidateEvidenceSignerSummary[];
    promotion: CandidateEvidencePromotionArtifacts;
  };
  gates: CandidateEvidenceGateSnapshot;
  disclosure: string;
}

export interface MioCandidateEvidencePackage extends MioCandidateEvidencePackageBody {
  packageSha256: string;
}

export interface CandidateEvidencePackageVerification {
  valid: boolean;
  errors: string[];
  packageSha256?: string;
  candidateId?: string;
  lifecycle?: MioModelManifest['lifecycle'];
}

function packageBody(value: MioCandidateEvidencePackage): MioCandidateEvidencePackageBody {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    exportedAt: value.exportedAt,
    candidate: value.candidate,
    manifest: value.manifest,
    evidence: value.evidence,
    gates: value.gates,
    disclosure: value.disclosure,
  };
}

function parsePackage(text: string): MioCandidateEvidencePackage {
  if (!text.trim()) throw new Error('Candidate evidence package is empty');
  if (text.length > MAX_PACKAGE_CHARS) throw new Error('Candidate evidence package exceeds the 16 MiB verification limit');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Candidate evidence package is invalid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Candidate evidence package must be a JSON object');
  return parsed as MioCandidateEvidencePackage;
}

function normalizedPortableKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function privacyErrors(value: unknown, path = 'package', depth = 0): string[] {
  if (depth > 32) return [`Candidate evidence package exceeds privacy-scan nesting limit at ${path}`];
  if (value === null || typeof value !== 'object') return [];
  const errors: string[] = [];
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) errors.push(...privacyErrors(value[index], `${path}[${index}]`, depth + 1));
    return errors;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PORTABLE_KEYS.has(normalizedPortableKey(key))) errors.push(`Candidate evidence package contains forbidden portable field '${path}.${key}'`);
    errors.push(...privacyErrors(child, `${path}.${key}`, depth + 1));
  }
  return errors;
}

function unknownSchemaFieldErrors(pkg: MioCandidateEvidencePackage): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(pkg)) if (!TOP_LEVEL_KEYS.has(key)) errors.push(`Unknown candidate evidence package top-level field '${key}'`);
  if (pkg.evidence && typeof pkg.evidence === 'object' && !Array.isArray(pkg.evidence)) {
    for (const key of Object.keys(pkg.evidence)) if (!EVIDENCE_KEYS.has(key)) errors.push(`Unknown candidate evidence field '${key}'`);
    if (pkg.evidence.promotion && typeof pkg.evidence.promotion === 'object' && !Array.isArray(pkg.evidence.promotion)) {
      for (const key of Object.keys(pkg.evidence.promotion)) if (!PROMOTION_KEYS.has(key)) errors.push(`Unknown candidate promotion evidence field '${key}'`);
    }
  }
  if (pkg.gates && typeof pkg.gates === 'object' && !Array.isArray(pkg.gates)) {
    for (const key of Object.keys(pkg.gates)) if (!GATE_KEYS.has(key)) errors.push(`Unknown candidate evidence gate field '${key}'`);
  }
  return errors;
}

async function benchmarkSummary(stored: StoredBenchmarkReport): Promise<CandidateEvidenceBenchmarkSummary> {
  return {
    id: stored.id,
    manifestId: stored.manifestId,
    recordedAt: stored.recordedAt,
    sourceReportSha256: await sha256Hex(stableJsonStringify(stored.report)),
    provider: stored.report.provider,
    model: stored.report.model,
    generatedAt: stored.report.generatedAt,
    score: stored.report.score,
    maxScore: stored.report.maxScore,
    passRate: stored.report.passRate,
    results: stored.report.results.map((result) => ({
      id: result.id,
      domain: result.domain,
      score: result.score,
      maxScore: result.maxScore,
      passed: result.passed,
      latencyMs: result.latencyMs,
    })),
  };
}

function benchmarkSummaryErrors(summary: CandidateEvidenceBenchmarkSummary, manifest: MioModelManifest, label: string): string[] {
  const errors: string[] = [];
  if (!summary.id?.trim() || !summary.manifestId?.trim()) errors.push(`${label} benchmark identity is malformed`);
  if (summary.manifestId !== manifest.id) errors.push(`${label} benchmark is not bound to packaged manifest`);
  if (summary.model !== manifest.runtimeModel) errors.push(`${label} benchmark model identity does not match packaged runtime model`);
  if (!SHA256.test(summary.sourceReportSha256 ?? '')) errors.push(`${label} benchmark source report SHA-256 is malformed`);
  if (!Number.isSafeInteger(summary.recordedAt) || summary.recordedAt <= 0 || !Number.isSafeInteger(summary.generatedAt) || summary.generatedAt <= 0) errors.push(`${label} benchmark timestamps are invalid`);
  if (!Number.isFinite(summary.score) || !Number.isFinite(summary.maxScore) || summary.maxScore < 0 || !Number.isFinite(summary.passRate) || summary.passRate < 0 || summary.passRate > 1) errors.push(`${label} benchmark aggregate metrics are invalid`);
  if (!Array.isArray(summary.results)) errors.push(`${label} benchmark results are invalid`);
  else {
    for (const result of summary.results) {
      if (!result.id?.trim() || !result.domain?.trim() || !Number.isFinite(result.score) || !Number.isFinite(result.maxScore) || typeof result.passed !== 'boolean' || !Number.isFinite(result.latencyMs) || result.latencyMs < 0) {
        errors.push(`${label} benchmark case summary is malformed`);
        break;
      }
    }
  }
  return errors;
}

function candidateIdentityErrors(pkg: MioCandidateEvidencePackage): string[] {
  const { candidate, manifest, evidence } = pkg;
  const errors: string[] = [];
  if (!candidate || !manifest) return ['Candidate evidence package is missing candidate or manifest'];
  if (candidate.manifestId !== manifest.id) errors.push('Candidate manifestId does not match packaged model manifest');
  if (candidate.bundleId !== manifest.dataset.id) errors.push('Candidate bundleId does not match manifest dataset id');
  if (candidate.datasetSha256 !== manifest.dataset.fingerprint) errors.push('Candidate dataset SHA-256 does not match manifest dataset fingerprint');
  if (candidate.artifactUri !== manifest.adapterUri) errors.push('Candidate artifact URI does not match model manifest');

  const receipt = evidence?.handoffReceipt;
  if (receipt) {
    if (receipt.candidateId !== candidate.id || receipt.manifestId !== manifest.id) errors.push('Handoff receipt candidate identity does not match packaged candidate');
    if (receipt.trainingResultSha256 !== candidate.trainingResultSha256) errors.push('Handoff receipt training-result SHA-256 does not match packaged candidate');
    if (receipt.bundleId !== candidate.bundleId || receipt.datasetSha256 !== candidate.datasetSha256 || receipt.configSha256 !== candidate.configSha256) errors.push('Handoff receipt bundle fingerprints do not match packaged candidate');
    if (!SHA256.test(receipt.handoffSha256) || !SHA256.test(receipt.trainingResultSha256)) errors.push('Handoff receipt SHA-256 contract is malformed');
  }

  const benchmark = evidence?.latestBenchmark;
  if (benchmark) errors.push(...benchmarkSummaryErrors(benchmark, manifest, 'Latest'));

  const integrity = evidence?.latestIntegrity;
  if (integrity) {
    if (integrity.candidateId !== candidate.id || integrity.manifestId !== manifest.id) errors.push('Latest integrity evidence is not bound to packaged candidate');
    if (integrity.runtimeModel !== manifest.runtimeModel || integrity.artifactUri !== candidate.artifactUri) errors.push('Latest integrity runtime/artifact identity does not match packaged candidate');
    if (integrity.trainingResultSha256 !== candidate.trainingResultSha256) errors.push('Latest integrity result SHA-256 does not match packaged candidate');
    if (!SHA256.test(integrity.fingerprint) || !SHA256.test(integrity.baselineFingerprint)) errors.push('Latest integrity fingerprint contract is malformed');
  }

  const binding = evidence?.latestArtifactBinding;
  if (binding) {
    if (binding.candidateId !== candidate.id || binding.manifestId !== manifest.id) errors.push('Latest artifact binding is not bound to packaged candidate');
    if (binding.trainingResultSha256 !== candidate.trainingResultSha256) errors.push('Latest artifact binding result SHA-256 does not match packaged candidate');
    if (binding.runtimeModel !== manifest.runtimeModel || binding.artifactUri !== candidate.artifactUri) errors.push('Latest artifact binding runtime/artifact identity does not match packaged candidate');
    if (receipt && (binding.handoffReceiptId !== receipt.id || binding.handoffSha256 !== receipt.handoffSha256)) errors.push('Latest artifact binding does not match packaged handoff receipt');
    if (!SHA256.test(binding.bindingSha256) || !SHA256.test(binding.adapterFingerprint) || !SHA256.test(binding.baselineFingerprint)) errors.push('Latest artifact binding fingerprint contract is malformed');
  }

  const provenance = evidence?.latestProvenance;
  if (provenance) {
    if (provenance.candidateId !== candidate.id || provenance.manifestId !== manifest.id) errors.push('Latest signed provenance is not bound to packaged candidate');
    if (provenance.runtimeModel !== manifest.runtimeModel || provenance.artifactUri !== candidate.artifactUri) errors.push('Latest signed provenance runtime/artifact identity does not match packaged candidate');
    if (provenance.trainingResultSha256 !== candidate.trainingResultSha256) errors.push('Latest signed provenance result SHA-256 does not match packaged candidate');
    if (!SHA256.test(provenance.payloadSha256) || !SHA256.test(provenance.envelopeSha256) || !SHA256.test(provenance.artifactFingerprint)) errors.push('Latest signed provenance fingerprint contract is malformed');
  }

  const signers = evidence?.signerSummaries ?? [];
  if (!Array.isArray(signers)) errors.push('Candidate evidence package signer summaries are invalid');
  else {
    if (new Set(signers.map((item) => item.keyId)).size !== signers.length) errors.push('Candidate evidence package contains duplicate signer summaries');
    if (provenance && !signers.some((item) => item.keyId === provenance.signerKeyId)) errors.push('Latest signed provenance signer summary is missing');
  }

  const promotion = evidence?.promotion ?? {};
  if (promotion.benchmark) errors.push(...benchmarkSummaryErrors(promotion.benchmark, manifest, 'Promotion'));
  if (manifest.promotion) {
    if (!promotion.benchmark || promotion.benchmark.id !== manifest.promotion.benchmarkReportId) errors.push('Promotion benchmark evidence referenced by manifest is missing');
    if (manifest.promotion.integrityEvidenceId && promotion.integrity?.id !== manifest.promotion.integrityEvidenceId) errors.push('Promotion integrity evidence referenced by manifest is missing');
    if (manifest.promotion.artifactBindingEvidenceId && promotion.artifactBinding?.id !== manifest.promotion.artifactBindingEvidenceId) errors.push('Promotion artifact-binding evidence referenced by manifest is missing');
    if (manifest.promotion.provenanceEvidenceId && promotion.provenance?.id !== manifest.promotion.provenanceEvidenceId) errors.push('Promotion signed-provenance evidence referenced by manifest is missing');
    if (promotion.provenance && !signers.some((item) => item.keyId === promotion.provenance!.signerKeyId)) errors.push('Promotion signed-provenance signer summary is missing');
  }

  return [...new Set(errors)];
}

export async function verifyCandidateEvidencePackage(text: string): Promise<CandidateEvidencePackageVerification> {
  let pkg: MioCandidateEvidencePackage;
  try { pkg = parsePackage(text); } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : 'Candidate evidence package could not be parsed'] };
  }
  const errors: string[] = [];
  if (pkg.schemaVersion !== 1) errors.push('Unsupported candidate evidence package schema');
  if (pkg.kind !== 'MIO_CANDIDATE_EVIDENCE_PACKAGE_V1') errors.push('Unsupported candidate evidence package kind');
  if (!Number.isSafeInteger(pkg.exportedAt) || pkg.exportedAt <= 0) errors.push('Candidate evidence package exportedAt is invalid');
  if (!pkg.evidence || typeof pkg.evidence !== 'object' || Array.isArray(pkg.evidence)) errors.push('Candidate evidence package evidence section is missing');
  if (!pkg.gates || typeof pkg.gates !== 'object' || Array.isArray(pkg.gates)) errors.push('Candidate evidence package gate snapshot is missing');
  if (!pkg.disclosure?.trim() || pkg.disclosure.length > 1500) errors.push('Candidate evidence package disclosure is invalid');
  if (!SHA256.test(pkg.packageSha256 ?? '')) errors.push('Candidate evidence package SHA-256 is malformed');
  errors.push(...unknownSchemaFieldErrors(pkg));
  errors.push(...privacyErrors(pkg));
  errors.push(...candidateIdentityErrors(pkg));

  let computed: string | undefined;
  try {
    computed = await sha256Hex(stableJsonStringify(packageBody(pkg)));
    if (SHA256.test(pkg.packageSha256 ?? '') && computed !== pkg.packageSha256) errors.push('Candidate evidence package SHA-256 digest mismatch');
  } catch (error) {
    errors.push(`Candidate evidence package digest could not be computed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    ...(computed ? { packageSha256: computed } : {}),
    ...(pkg.candidate?.id ? { candidateId: pkg.candidate.id } : {}),
    ...(pkg.manifest?.lifecycle ? { lifecycle: pkg.manifest.lifecycle } : {}),
  };
}

export class TrainingCandidateEvidencePackageService {
  private readonly candidates: TrainingCandidateRegistry;
  private readonly manifests: ModelManifestRepository;
  private readonly benchmarks: BenchmarkReportRepository;
  private readonly integrity: TrainingCandidateIntegrityService;
  private readonly handoffs: TrainingRunHandoffService;
  private readonly bindings: TrainingArtifactBindingService;
  private readonly provenance: TrainingCandidateProvenanceService;
  private readonly signers: ModelSignerTrustStore;
  private readonly reviews: TrainingCandidateReviewService;
  private readonly promotions: ModelPromotionService;

  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {
    this.candidates = new TrainingCandidateRegistry(storage);
    this.manifests = new ModelManifestRepository(storage);
    this.benchmarks = new BenchmarkReportRepository(storage);
    this.integrity = new TrainingCandidateIntegrityService(storage);
    this.handoffs = new TrainingRunHandoffService(storage);
    this.bindings = new TrainingArtifactBindingService(storage);
    this.provenance = new TrainingCandidateProvenanceService(storage);
    this.signers = new ModelSignerTrustStore(storage);
    this.reviews = new TrainingCandidateReviewService(storage);
    this.promotions = new ModelPromotionService(storage);
  }

  public async export(candidateId: string, exportedAt = Date.now()): Promise<MioCandidateEvidencePackage> {
    if (!Number.isSafeInteger(exportedAt) || exportedAt <= 0) throw new Error('Candidate evidence export timestamp is invalid');
    const candidate = await this.candidates.get(candidateId);
    if (!candidate) throw new Error(`Training candidate '${candidateId}' is not registered`);
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) throw new Error(`Model manifest '${candidate.manifestId}' is missing`);

    const [review, promotionSnapshot, latestBenchmarkRaw, latestIntegrity, handoffReceipt, latestBinding, latestProvenance, integrityHistory, provenanceHistory] = await Promise.all([
      this.reviews.inspect(candidate.id),
      this.promotions.inspect(manifest.id),
      this.benchmarks.latestForManifest(manifest.id),
      this.integrity.latest(candidate.id),
      this.handoffs.getReceipt(candidate.id),
      this.bindings.latest(candidate.id),
      this.provenance.latest(candidate.id),
      this.integrity.list(candidate.id, 500),
      this.provenance.list(candidate.id, 500),
    ]);
    if (!review) throw new Error('Candidate review snapshot is unavailable');

    const latestBenchmark = latestBenchmarkRaw ? await benchmarkSummary(latestBenchmarkRaw) : undefined;
    const promotionArtifacts: CandidateEvidencePromotionArtifacts = {};
    if (manifest.promotion) {
      const benchmarkHistory = await this.benchmarks.listForManifest(manifest.id, 200);
      const promotionBenchmark = benchmarkHistory.find((item) => item.id === manifest.promotion!.benchmarkReportId);
      if (promotionBenchmark) promotionArtifacts.benchmark = await benchmarkSummary(promotionBenchmark);
      if (manifest.promotion.integrityEvidenceId) promotionArtifacts.integrity = integrityHistory.find((item) => item.id === manifest.promotion!.integrityEvidenceId);
      if (manifest.promotion.artifactBindingEvidenceId) promotionArtifacts.artifactBinding = await this.bindings.get(manifest.promotion.artifactBindingEvidenceId);
      if (manifest.promotion.provenanceEvidenceId) promotionArtifacts.provenance = provenanceHistory.find((item) => item.id === manifest.promotion!.provenanceEvidenceId);
    }

    const signerIds = new Set<string>();
    if (latestProvenance) signerIds.add(latestProvenance.signerKeyId);
    if (promotionArtifacts.provenance) signerIds.add(promotionArtifacts.provenance.signerKeyId);
    const signerSummaries: CandidateEvidenceSignerSummary[] = [];
    for (const keyId of [...signerIds].sort()) {
      const signer = await this.signers.get(keyId);
      if (signer) {
        signerSummaries.push({
          keyId: signer.keyId,
          label: signer.label,
          status: signer.status,
          trustedAt: signer.trustedAt,
          ...(signer.revokedAt ? { revokedAt: signer.revokedAt } : {}),
        });
      }
    }

    const body: MioCandidateEvidencePackageBody = {
      schemaVersion: 1,
      kind: 'MIO_CANDIDATE_EVIDENCE_PACKAGE_V1',
      exportedAt,
      candidate: structuredClone(candidate),
      manifest: structuredClone(manifest),
      evidence: {
        ...(handoffReceipt ? { handoffReceipt: structuredClone(handoffReceipt) } : {}),
        ...(latestBenchmark ? { latestBenchmark: structuredClone(latestBenchmark) } : {}),
        ...(latestIntegrity ? { latestIntegrity: structuredClone(latestIntegrity) } : {}),
        ...(latestBinding ? { latestArtifactBinding: structuredClone(latestBinding) } : {}),
        ...(latestProvenance ? { latestProvenance: structuredClone(latestProvenance) } : {}),
        signerSummaries,
        promotion: structuredClone(promotionArtifacts),
      },
      gates: {
        releaseCandidateEligible: review.releaseCandidateEligible,
        releaseBlockingReasons: [...review.blockingReasons],
        promotionEligible: promotionSnapshot?.promotionEligible ?? false,
        promotionBlockingReasons: [...(promotionSnapshot?.blockingReasons ?? [`Model lifecycle ${manifest.lifecycle} is not currently eligible for promotion inspection`])],
      },
      disclosure: 'Portable MIO candidate evidence snapshot. It contains model/candidate metadata and bounded governance evidence only. Benchmark outputs are omitted and replaced by score summaries plus the source report SHA-256. It does not contain training JSONL, user message content, model weights, adapter bytes, private keys, credentials, authorization grants, or tool secrets. Package consistency does not itself prove model quality, safety, authenticity, promotion eligibility, or activation safety.',
    };
    const pkg: MioCandidateEvidencePackage = {
      ...body,
      packageSha256: await sha256Hex(stableJsonStringify(body)),
    };
    const verification = await verifyCandidateEvidencePackage(JSON.stringify(pkg));
    if (!verification.valid) throw new Error(`Candidate evidence package self-verification failed: ${verification.errors.join('; ')}`);
    return structuredClone(pkg);
  }
}

export const trainingCandidateEvidencePackageService = new TrainingCandidateEvidencePackageService();
