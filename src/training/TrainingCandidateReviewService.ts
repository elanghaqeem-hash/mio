import { defaultStorageProvider } from '../storage/StorageRuntime';
import { StorageProvider } from '../storage/StorageProvider';
import { BenchmarkReportRepository, StoredBenchmarkReport } from './BenchmarkReportRepository';
import { CandidateAdapterIntegrityEvidence, TrainingCandidateIntegrityService } from './TrainingCandidateIntegrityService';
import { MioModelManifest } from './ModelManifest';
import { ModelManifestRepository } from './ModelManifestRepository';
import { evaluateModelPromotion } from './ModelPromotionGate';
import { TrainingCandidateRecord, TrainingCandidateRegistry } from './TrainingCandidateRegistry';

export interface TrainingCandidateReviewSnapshot {
  candidate: TrainingCandidateRecord;
  manifest: MioModelManifest;
  latestBenchmark?: StoredBenchmarkReport;
  latestIntegrity?: CandidateAdapterIntegrityEvidence;
  releaseCandidateEligible: boolean;
  blockingReasons: string[];
}

export interface AdvanceReleaseCandidateInput {
  candidateId: string;
  reviewer: string;
  dataGovernanceAttested: boolean;
  securityAttested: boolean;
}

export interface ReleaseCandidateTransitionResult {
  manifest: MioModelManifest;
  benchmarkReportId: string;
  transitionedAt: number;
}

export class TrainingCandidateReviewService {
  private readonly candidates: TrainingCandidateRegistry;
  private readonly manifests: ModelManifestRepository;
  private readonly benchmarks: BenchmarkReportRepository;
  private readonly integrity: TrainingCandidateIntegrityService;

  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {
    this.candidates = new TrainingCandidateRegistry(storage);
    this.manifests = new ModelManifestRepository(storage);
    this.benchmarks = new BenchmarkReportRepository(storage);
    this.integrity = new TrainingCandidateIntegrityService(storage);
  }

  public async list(limit = 100): Promise<TrainingCandidateReviewSnapshot[]> {
    const candidates = await this.candidates.list(limit);
    const output: TrainingCandidateReviewSnapshot[] = [];
    for (const candidate of candidates) {
      const snapshot = await this.inspect(candidate.id);
      if (snapshot) output.push(snapshot);
    }
    return output;
  }

  public async inspect(candidateId: string): Promise<TrainingCandidateReviewSnapshot | undefined> {
    const candidate = await this.candidates.get(candidateId);
    if (!candidate) return undefined;
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) return undefined;
    const [latestBenchmark, latestIntegrity] = await Promise.all([
      this.benchmarks.latestForManifest(manifest.id),
      this.integrity.latest(candidate.id),
    ]);
    const blockingReasons = this.blockingReasons(candidate, manifest, latestBenchmark, latestIntegrity);
    return {
      candidate,
      manifest,
      latestBenchmark,
      latestIntegrity,
      releaseCandidateEligible: blockingReasons.length === 0,
      blockingReasons,
    };
  }

  public async advanceToReleaseCandidate(input: AdvanceReleaseCandidateInput): Promise<ReleaseCandidateTransitionResult> {
    const reviewer = input.reviewer.trim().slice(0, 200);
    if (!reviewer) throw new Error('Release-candidate transition requires a named reviewer');
    if (!input.dataGovernanceAttested) throw new Error('Data-governance review attestation is required');
    if (!input.securityAttested) throw new Error('Security review attestation is required');

    const snapshot = await this.inspect(input.candidateId);
    if (!snapshot) throw new Error(`Training candidate '${input.candidateId}' is not registered`);
    if (snapshot.manifest.lifecycle === 'RELEASE_CANDIDATE') throw new Error('Training candidate is already RELEASE_CANDIDATE');
    if (snapshot.manifest.lifecycle !== 'EXPERIMENTAL') throw new Error(`Only EXPERIMENTAL candidates can enter RELEASE_CANDIDATE review; found ${snapshot.manifest.lifecycle}`);
    if (snapshot.blockingReasons.length) throw new Error(`Release-candidate transition blocked: ${snapshot.blockingReasons.join('; ')}`);
    if (!snapshot.latestBenchmark) throw new Error('Release-candidate transition requires a stored benchmark report');

    const transitionedAt = Date.now();
    const releaseCandidate: MioModelManifest = {
      ...snapshot.manifest,
      lifecycle: 'RELEASE_CANDIDATE',
      review: {
        dataGovernanceReviewed: true,
        securityReviewed: true,
        reviewer,
        reviewedAt: transitionedAt,
      },
      notes: [
        snapshot.manifest.notes,
        `Advanced to RELEASE_CANDIDATE after explicit data-governance and security attestations using benchmark report ${snapshot.latestBenchmark.id}. Promotion remains a separate explicit action.`,
        snapshot.latestIntegrity ? `Latest adapter byte-integrity evidence at review: ${snapshot.latestIntegrity.id} (${snapshot.latestIntegrity.comparison}).` : undefined,
      ].filter(Boolean).join(' '),
    };

    const promotionReadiness = evaluateModelPromotion(releaseCandidate, snapshot.latestBenchmark.report);
    if (!promotionReadiness.allowed) {
      throw new Error(`Release-candidate transition failed promotion-readiness revalidation: ${promotionReadiness.reasons.join('; ')}`);
    }

    await this.manifests.save(releaseCandidate);
    return { manifest: releaseCandidate, benchmarkReportId: snapshot.latestBenchmark.id, transitionedAt };
  }

  private blockingReasons(
    candidate: TrainingCandidateRecord,
    manifest: MioModelManifest,
    latestBenchmark?: StoredBenchmarkReport,
    latestIntegrity?: CandidateAdapterIntegrityEvidence,
  ): string[] {
    const reasons: string[] = [];
    if (manifest.lifecycle !== 'EXPERIMENTAL') reasons.push(`Model lifecycle is ${manifest.lifecycle}, not EXPERIMENTAL`);
    if (candidate.status !== 'BENCHMARKED_POLICY_PASS') reasons.push('Candidate has not recorded a benchmark policy pass');
    if (!candidate.latestBenchmarkReportId || !candidate.latestBenchmarkAt) reasons.push('Candidate has no bound benchmark report');
    if (!latestBenchmark) reasons.push('Stored benchmark report is unavailable');
    if (latestBenchmark && candidate.latestBenchmarkReportId !== latestBenchmark.id) reasons.push('Candidate benchmark pointer does not match latest stored benchmark report');
    if (latestBenchmark && latestBenchmark.report.model !== manifest.runtimeModel) reasons.push('Stored benchmark model identity does not match candidate runtime model');
    if (latestBenchmark && latestBenchmark.report.generatedAt < manifest.createdAt) reasons.push('Stored benchmark report predates the candidate manifest');

    if (latestIntegrity) {
      if (latestIntegrity.candidateId !== candidate.id || latestIntegrity.manifestId !== manifest.id) reasons.push('Adapter integrity evidence is not bound to the current candidate manifest');
      if (latestIntegrity.runtimeModel !== manifest.runtimeModel) reasons.push('Adapter integrity evidence runtime identity does not match candidate runtime model');
      if (latestIntegrity.artifactUri !== candidate.artifactUri) reasons.push('Adapter integrity evidence artifact identity does not match candidate artifact URI');
      if (latestIntegrity.trainingResultFingerprint !== candidate.trainingResultFingerprint) reasons.push('Adapter integrity evidence training-result fingerprint does not match candidate registration');
      if (!/^[a-f0-9]{64}$/.test(latestIntegrity.fingerprint)) reasons.push('Adapter integrity evidence fingerprint is malformed');
      if (latestIntegrity.comparison === 'DRIFT') reasons.push('Latest adapter byte-integrity evidence reports DRIFT');
    }

    if (latestBenchmark) {
      const prospective: MioModelManifest = {
        ...manifest,
        lifecycle: 'RELEASE_CANDIDATE',
        review: {
          dataGovernanceReviewed: true,
          securityReviewed: true,
          reviewer: 'release-candidate-readiness-check',
          reviewedAt: Date.now(),
        },
      };
      const decision = evaluateModelPromotion(prospective, latestBenchmark.report);
      reasons.push(...decision.reasons.map((reason) => `Benchmark policy: ${reason}`));
    }
    return [...new Set(reasons)];
  }
}

export const trainingCandidateReviewService = new TrainingCandidateReviewService();
