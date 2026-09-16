import { defaultStorageProvider } from '../storage/StorageRuntime';
import { StorageProvider } from '../storage/StorageProvider';
import { BenchmarkReportRepository, StoredBenchmarkReport } from './BenchmarkReportRepository';
import {
  TrainingArtifactBindingService,
  type TrainingArtifactBindingEvidence,
  type TrainingArtifactBindingVerification,
} from './TrainingArtifactBindingService';
import { CandidateAdapterIntegrityEvidence, TrainingCandidateIntegrityService } from './TrainingCandidateIntegrityService';
import {
  CandidateSignedProvenanceEvidence,
  ModelSignerTrustStore,
  TrainingCandidateProvenanceService,
  type ModelSignerTrustStatus,
  type TrustedModelSigner,
} from './SignedModelArtifactProvenance';
import { MioModelManifest } from './ModelManifest';
import { ModelManifestRepository } from './ModelManifestRepository';
import { evaluateModelPromotion } from './ModelPromotionGate';
import { TrainingCandidateRecord, TrainingCandidateRegistry } from './TrainingCandidateRegistry';
import { TrainingRunHandoffService, type TrainingRunHandoffReceipt } from './TrainingRunHandoffService';

export interface TrainingCandidateReviewSnapshot {
  candidate: TrainingCandidateRecord;
  manifest: MioModelManifest;
  latestBenchmark?: StoredBenchmarkReport;
  latestIntegrity?: CandidateAdapterIntegrityEvidence;
  handoffReceipt?: TrainingRunHandoffReceipt;
  latestArtifactBinding?: TrainingArtifactBindingEvidence;
  artifactBindingValid?: boolean;
  latestProvenance?: CandidateSignedProvenanceEvidence;
  provenanceSignerStatus?: ModelSignerTrustStatus;
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
  private readonly handoffs: TrainingRunHandoffService;
  private readonly artifactBindings: TrainingArtifactBindingService;
  private readonly provenance: TrainingCandidateProvenanceService;
  private readonly signers: ModelSignerTrustStore;

  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {
    this.candidates = new TrainingCandidateRegistry(storage);
    this.manifests = new ModelManifestRepository(storage);
    this.benchmarks = new BenchmarkReportRepository(storage);
    this.integrity = new TrainingCandidateIntegrityService(storage);
    this.handoffs = new TrainingRunHandoffService(storage);
    this.artifactBindings = new TrainingArtifactBindingService(storage);
    this.provenance = new TrainingCandidateProvenanceService(storage);
    this.signers = new ModelSignerTrustStore(storage);
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
    const [latestBenchmark, latestIntegrity, latestProvenance, handoffReceipt] = await Promise.all([
      this.benchmarks.latestForManifest(manifest.id),
      this.integrity.latest(candidate.id),
      this.provenance.latest(candidate.id),
      this.handoffs.getReceipt(candidate.id),
    ]);
    const artifactBindingVerification = handoffReceipt
      ? await this.artifactBindings.verifyLatest(candidate.id)
      : undefined;
    const provenanceSigner = latestProvenance ? await this.signers.get(latestProvenance.signerKeyId) : undefined;
    const blockingReasons = this.blockingReasons(
      candidate,
      manifest,
      latestBenchmark,
      latestIntegrity,
      latestProvenance,
      provenanceSigner,
      handoffReceipt,
      artifactBindingVerification,
    );
    return {
      candidate,
      manifest,
      latestBenchmark,
      latestIntegrity,
      handoffReceipt,
      latestArtifactBinding: artifactBindingVerification?.binding,
      artifactBindingValid: artifactBindingVerification?.valid,
      latestProvenance,
      provenanceSignerStatus: provenanceSigner?.status,
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
        snapshot.latestIntegrity ? `Latest adapter byte-integrity evidence at review: ${snapshot.latestIntegrity.id} (${snapshot.latestIntegrity.comparison}, baseline ${snapshot.latestIntegrity.baselineFingerprint}).` : undefined,
        snapshot.latestArtifactBinding ? `Training handoff-to-adapter binding at review: ${snapshot.latestArtifactBinding.id} (SHA-256 ${snapshot.latestArtifactBinding.bindingSha256}).` : undefined,
        snapshot.latestProvenance ? `Latest signed artifact provenance at review: ${snapshot.latestProvenance.id} (signer ${snapshot.latestProvenance.signerKeyId}, trust ${snapshot.provenanceSignerStatus ?? 'UNKNOWN'}).` : undefined,
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
    latestProvenance?: CandidateSignedProvenanceEvidence,
    provenanceSigner?: TrustedModelSigner,
    handoffReceipt?: TrainingRunHandoffReceipt,
    artifactBindingVerification?: TrainingArtifactBindingVerification,
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
      if (latestIntegrity.trainingResultSha256 !== candidate.trainingResultSha256) reasons.push('Adapter integrity evidence training-result SHA-256 does not match candidate registration');
      if (!/^[a-f0-9]{64}$/.test(latestIntegrity.fingerprint) || !/^[a-f0-9]{64}$/.test(latestIntegrity.baselineFingerprint)) reasons.push('Adapter integrity evidence fingerprint is malformed');
      if (latestIntegrity.comparison === 'DRIFT') reasons.push('Latest adapter byte-integrity evidence reports DRIFT');
    }

    if (handoffReceipt && !artifactBindingVerification?.valid) {
      const bindingReasons = artifactBindingVerification?.errors.length
        ? artifactBindingVerification.errors
        : ['Current handoff-to-adapter binding is unavailable'];
      reasons.push(...bindingReasons.map((reason) => `Training handoff artifact binding: ${reason}`));
    }

    if (latestProvenance) {
      if (latestProvenance.candidateId !== candidate.id || latestProvenance.manifestId !== manifest.id) reasons.push('Signed provenance evidence is not bound to the current candidate manifest');
      if (latestProvenance.runtimeModel !== manifest.runtimeModel) reasons.push('Signed provenance runtime identity does not match candidate runtime model');
      if (latestProvenance.artifactUri !== candidate.artifactUri) reasons.push('Signed provenance artifact identity does not match candidate artifact URI');
      if (latestProvenance.trainingResultSha256 !== candidate.trainingResultSha256) reasons.push('Signed provenance training-result SHA-256 does not match candidate registration');
      if (!latestIntegrity) reasons.push('Signed provenance exists but current adapter byte-integrity evidence is unavailable');
      if (latestIntegrity && latestProvenance.artifactFingerprint !== latestIntegrity.fingerprint) reasons.push('Signed provenance artifact fingerprint does not match latest adapter integrity evidence');
      if (!provenanceSigner || provenanceSigner.status !== 'TRUSTED') reasons.push('Signed provenance signer is no longer trusted');
      if (provenanceSigner && provenanceSigner.keyId !== latestProvenance.signerKeyId) reasons.push('Signed provenance signer key identity is inconsistent');
      if (!/^[a-f0-9]{64}$/.test(latestProvenance.payloadSha256) || !/^[a-f0-9]{64}$/.test(latestProvenance.envelopeSha256)) reasons.push('Signed provenance verification evidence is malformed');
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
