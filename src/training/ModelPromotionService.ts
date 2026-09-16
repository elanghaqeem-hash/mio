import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import { BenchmarkReportRepository, type StoredBenchmarkReport } from './BenchmarkReportRepository';
import { type CandidateAdapterIntegrityEvidence, TrainingCandidateIntegrityService } from './TrainingCandidateIntegrityService';
import type { MioModelManifest } from './ModelManifest';
import { ModelManifestRepository } from './ModelManifestRepository';
import { evaluateModelPromotion, promoteManifest } from './ModelPromotionGate';
import { type TrainingCandidateRecord, TrainingCandidateRegistry } from './TrainingCandidateRegistry';

export interface ModelPromotionSnapshot {
  candidate?: TrainingCandidateRecord;
  manifest: MioModelManifest;
  latestBenchmark?: StoredBenchmarkReport;
  latestIntegrity?: CandidateAdapterIntegrityEvidence;
  promotionEligible: boolean;
  blockingReasons: string[];
}

export interface PromoteModelInput {
  manifestId: string;
  promoter: string;
  finalAttestation: boolean;
}

export interface PromoteModelResult {
  manifest: MioModelManifest;
  benchmarkReportId: string;
  promotedAt: number;
  integrityEvidenceId?: string;
}

export class ModelPromotionService {
  private readonly manifests: ModelManifestRepository;
  private readonly benchmarks: BenchmarkReportRepository;
  private readonly candidates: TrainingCandidateRegistry;
  private readonly integrity: TrainingCandidateIntegrityService;

  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {
    this.manifests = new ModelManifestRepository(storage);
    this.benchmarks = new BenchmarkReportRepository(storage);
    this.candidates = new TrainingCandidateRegistry(storage);
    this.integrity = new TrainingCandidateIntegrityService(storage);
  }

  public async listReleaseCandidates(limit = 100): Promise<ModelPromotionSnapshot[]> {
    const manifests = (await this.manifests.list(limit * 2)).filter((item) => item.lifecycle === 'RELEASE_CANDIDATE');
    const output: ModelPromotionSnapshot[] = [];
    for (const manifest of manifests.slice(0, Math.max(1, Math.min(limit, 500)))) {
      const snapshot = await this.inspect(manifest.id);
      if (snapshot) output.push(snapshot);
    }
    return output;
  }

  public async inspect(manifestId: string): Promise<ModelPromotionSnapshot | undefined> {
    const manifest = await this.manifests.get(manifestId);
    if (!manifest) return undefined;
    const candidate = await this.candidates.get(manifestId);
    const [latestBenchmark, latestIntegrity] = await Promise.all([
      this.benchmarks.latestForManifest(manifest.id),
      candidate ? this.integrity.latest(candidate.id) : Promise.resolve(undefined),
    ]);
    const blockingReasons = this.blockingReasons(manifest, candidate, latestBenchmark, latestIntegrity);
    return {
      candidate,
      manifest,
      latestBenchmark,
      latestIntegrity,
      promotionEligible: blockingReasons.length === 0,
      blockingReasons,
    };
  }

  public async promote(input: PromoteModelInput): Promise<PromoteModelResult> {
    const promoter = input.promoter.trim().slice(0, 200);
    if (!promoter) throw new Error('Model promotion requires a named promoter');
    if (!input.finalAttestation) throw new Error('Final promotion attestation is required');

    const snapshot = await this.inspect(input.manifestId);
    if (!snapshot) throw new Error(`Model manifest '${input.manifestId}' is unavailable`);
    if (snapshot.manifest.lifecycle === 'PROMOTED') throw new Error('Model is already PROMOTED');
    if (snapshot.manifest.lifecycle !== 'RELEASE_CANDIDATE') throw new Error(`Only RELEASE_CANDIDATE models can be promoted; found ${snapshot.manifest.lifecycle}`);
    if (snapshot.blockingReasons.length) throw new Error(`Model promotion blocked: ${snapshot.blockingReasons.join('; ')}`);
    if (!snapshot.latestBenchmark) throw new Error('Model promotion requires a stored benchmark report');

    const promotedAt = Date.now();
    const gated = promoteManifest(snapshot.manifest, snapshot.latestBenchmark.report, promoter);
    const promoted: MioModelManifest = {
      ...gated,
      notes: [
        snapshot.manifest.notes,
        `Promoted after explicit final attestation by ${promoter} using benchmark report ${snapshot.latestBenchmark.id}. Runtime activation remains a separate action.`,
        snapshot.latestIntegrity ? `Adapter byte-integrity evidence at promotion: ${snapshot.latestIntegrity.id} (${snapshot.latestIntegrity.comparison}, fingerprint ${snapshot.latestIntegrity.fingerprint}).` : undefined,
      ].filter(Boolean).join(' '),
    };
    await this.manifests.save(promoted);
    return {
      manifest: promoted,
      benchmarkReportId: snapshot.latestBenchmark.id,
      promotedAt,
      integrityEvidenceId: snapshot.latestIntegrity?.id,
    };
  }

  private blockingReasons(
    manifest: MioModelManifest,
    candidate?: TrainingCandidateRecord,
    latestBenchmark?: StoredBenchmarkReport,
    latestIntegrity?: CandidateAdapterIntegrityEvidence,
  ): string[] {
    const reasons: string[] = [];
    if (manifest.lifecycle !== 'RELEASE_CANDIDATE') reasons.push(`Model lifecycle is ${manifest.lifecycle}, not RELEASE_CANDIDATE`);
    if (!manifest.review.dataGovernanceReviewed) reasons.push('Data-governance review is incomplete');
    if (!manifest.review.securityReviewed) reasons.push('Security review is incomplete');
    if (!latestBenchmark) reasons.push('Stored benchmark report is unavailable');

    if (manifest.trainingMethod !== 'BASE' && !candidate) {
      reasons.push('Governed training-candidate binding is required for adapter-based promotion');
    }

    if (candidate) {
      if (candidate.manifestId !== manifest.id) reasons.push('Training candidate is not bound to the current model manifest');
      if (candidate.status !== 'BENCHMARKED_POLICY_PASS') reasons.push('Training candidate does not hold a benchmark policy pass');
      if (!candidate.latestBenchmarkReportId || candidate.latestBenchmarkReportId !== latestBenchmark?.id) reasons.push('Candidate benchmark pointer does not match the latest stored benchmark report');
      if (!latestIntegrity) {
        reasons.push('Adapter byte-integrity evidence is required before promotion');
      } else {
        if (latestIntegrity.candidateId !== candidate.id || latestIntegrity.manifestId !== manifest.id) reasons.push('Adapter integrity evidence is not bound to the current candidate manifest');
        if (latestIntegrity.runtimeModel !== manifest.runtimeModel) reasons.push('Adapter integrity runtime identity does not match the model manifest');
        if (latestIntegrity.artifactUri !== candidate.artifactUri) reasons.push('Adapter integrity artifact identity does not match the training candidate');
        if (latestIntegrity.trainingResultSha256 !== candidate.trainingResultSha256) reasons.push('Adapter integrity training-result SHA does not match the training candidate');
        if (!/^[a-f0-9]{64}$/.test(latestIntegrity.fingerprint) || !/^[a-f0-9]{64}$/.test(latestIntegrity.baselineFingerprint)) reasons.push('Adapter integrity fingerprint contract is invalid');
        if (latestIntegrity.comparison === 'DRIFT') reasons.push('Latest adapter byte-integrity evidence reports DRIFT from the immutable baseline');
      }
    }

    if (latestBenchmark) {
      const decision = evaluateModelPromotion(manifest, latestBenchmark.report);
      reasons.push(...decision.reasons.map((reason) => `Promotion policy: ${reason}`));
    }
    return [...new Set(reasons)];
  }
}

export const modelPromotionService = new ModelPromotionService();
