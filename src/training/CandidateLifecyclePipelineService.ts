import { systemPreferences } from '../settings/SystemPreferences';
import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import type { ModelRouterConfig } from '../types/models';
import { ModelManifestRepository } from './ModelManifestRepository';
import { ModelPromotionService } from './ModelPromotionService';
import { TrainingCandidateRegistry } from './TrainingCandidateRegistry';
import { TrainingCandidateReviewService, type TrainingCandidateReviewSnapshot } from './TrainingCandidateReviewService';

export type CandidateLifecycleStageId =
  | 'REGISTERED'
  | 'HANDOFF'
  | 'ADAPTER_INTEGRITY'
  | 'ARTIFACT_BINDING'
  | 'MIOBENCH'
  | 'RELEASE_REVIEW'
  | 'SIGNED_PROVENANCE'
  | 'PROMOTION'
  | 'POST_PROMOTION_INTEGRITY'
  | 'ACTIVATION';

export type CandidateLifecycleStageState =
  | 'COMPLETE'
  | 'ACTION_REQUIRED'
  | 'BLOCKED'
  | 'PENDING'
  | 'OPTIONAL'
  | 'NOT_APPLICABLE';

export interface CandidateLifecycleStage {
  id: CandidateLifecycleStageId;
  label: string;
  state: CandidateLifecycleStageState;
  detail: string;
  actionLabel?: string;
  actionSurface?: string;
  blockers?: string[];
}

export interface CandidateLifecyclePipelineSnapshot {
  schemaVersion: 1;
  candidateId: string;
  manifestId: string;
  displayName: string;
  runtimeModel: string;
  lifecycle: TrainingCandidateReviewSnapshot['manifest']['lifecycle'];
  candidateStatus: TrainingCandidateReviewSnapshot['candidate']['status'];
  stages: CandidateLifecycleStage[];
  nextStageId?: CandidateLifecycleStageId;
  nextAction?: string;
  overallState: 'IN_PROGRESS' | 'BLOCKED' | 'PROMOTED' | 'ACTIVE';
  refreshedAt: number;
  disclosure: string;
}

export interface CandidateLifecyclePipelineOptions {
  routerConfigProvider?: () => ModelRouterConfig;
}

function stage(
  id: CandidateLifecycleStageId,
  label: string,
  state: CandidateLifecycleStageState,
  detail: string,
  options: { actionLabel?: string; actionSurface?: string; blockers?: string[] } = {},
): CandidateLifecycleStage {
  return {
    id,
    label,
    state,
    detail,
    ...(options.actionLabel ? { actionLabel: options.actionLabel } : {}),
    ...(options.actionSurface ? { actionSurface: options.actionSurface } : {}),
    ...(options.blockers?.length ? { blockers: [...new Set(options.blockers)] } : {}),
  };
}

function firstActionable(stages: CandidateLifecycleStage[]): CandidateLifecycleStage | undefined {
  return stages.find((item) => item.state === 'BLOCKED' || item.state === 'ACTION_REQUIRED');
}

export class CandidateLifecyclePipelineService {
  private readonly candidates: TrainingCandidateRegistry;
  private readonly reviews: TrainingCandidateReviewService;
  private readonly promotions: ModelPromotionService;
  private readonly manifests: ModelManifestRepository;
  private readonly routerConfigProvider: () => ModelRouterConfig;

  constructor(
    private readonly storage: StorageProvider = defaultStorageProvider,
    options: CandidateLifecyclePipelineOptions = {},
  ) {
    this.candidates = new TrainingCandidateRegistry(storage);
    this.reviews = new TrainingCandidateReviewService(storage);
    this.promotions = new ModelPromotionService(storage);
    this.manifests = new ModelManifestRepository(storage);
    this.routerConfigProvider = options.routerConfigProvider ?? (() => systemPreferences.getSnapshot().modelRouter);
  }

  public async list(limit = 100): Promise<CandidateLifecyclePipelineSnapshot[]> {
    const candidates = await this.candidates.list(limit);
    const activePromoted = await this.manifests.getActivePromoted();
    const config = this.routerConfigProvider();
    const output: CandidateLifecyclePipelineSnapshot[] = [];
    for (const candidate of candidates) {
      const snapshot = await this.inspect(candidate.id, activePromoted?.id, config);
      if (snapshot) output.push(snapshot);
    }
    return output;
  }

  public async inspect(candidateId: string): Promise<CandidateLifecyclePipelineSnapshot | undefined> {
    const [activePromoted, config] = await Promise.all([
      this.manifests.getActivePromoted(),
      Promise.resolve(this.routerConfigProvider()),
    ]);
    return this.inspect(candidateId, activePromoted?.id, config);
  }

  private async inspect(
    candidateId: string,
    activePromotedManifestId: string | undefined,
    config: ModelRouterConfig,
  ): Promise<CandidateLifecyclePipelineSnapshot | undefined> {
    const review = await this.reviews.inspect(candidateId);
    if (!review) return undefined;
    const { candidate, manifest } = review;
    const stages: CandidateLifecycleStage[] = [];

    stages.push(stage(
      'REGISTERED',
      'Candidate registration',
      'COMPLETE',
      `Registered as ${candidate.status} and bound to manifest ${manifest.id}.`,
    ));

    stages.push(review.handoffReceipt
      ? stage('HANDOFF', 'Governed training handoff', 'COMPLETE', `TP-0.58 handoff receipt ${review.handoffReceipt.handoffSha256.slice(0, 16)}… is recorded.`)
      : stage('HANDOFF', 'Governed training handoff', 'NOT_APPLICABLE', 'No TP-0.58 handoff receipt is recorded. This can be a legacy/manual governed import path.'));

    if (!review.latestIntegrity) {
      stages.push(stage(
        'ADAPTER_INTEGRITY',
        'Adapter byte integrity',
        'ACTION_REQUIRED',
        'No TP-0.50 adapter-integrity evidence is recorded.',
        { actionLabel: 'Run adapter integrity scan', actionSurface: 'Native Model Candidate Lab' },
      ));
    } else if (review.latestIntegrity.comparison === 'DRIFT') {
      stages.push(stage(
        'ADAPTER_INTEGRITY',
        'Adapter byte integrity',
        'BLOCKED',
        'Latest TP-0.50 scan reports DRIFT from the immutable baseline.',
        { actionLabel: 'Resolve artifact drift and re-scan', actionSurface: 'Native Model Candidate Lab', blockers: ['Latest adapter byte-integrity evidence reports DRIFT'] },
      ));
    } else {
      stages.push(stage(
        'ADAPTER_INTEGRITY',
        'Adapter byte integrity',
        'COMPLETE',
        `Latest TP-0.50 evidence is ${review.latestIntegrity.comparison} with fingerprint ${review.latestIntegrity.fingerprint.slice(0, 16)}….`,
      ));
    }

    if (!review.handoffReceipt) {
      stages.push(stage('ARTIFACT_BINDING', 'Handoff ↔ adapter binding', 'NOT_APPLICABLE', 'TP-0.59 binding is required only for candidates with a TP-0.58 handoff receipt.'));
    } else if (review.artifactBindingValid && review.latestArtifactBinding) {
      stages.push(stage('ARTIFACT_BINDING', 'Handoff ↔ adapter binding', 'COMPLETE', `Current TP-0.59 binding ${review.latestArtifactBinding.id} is valid.`));
    } else {
      const bindingBlockers = review.blockingReasons.filter((reason) => reason.startsWith('Training handoff artifact binding:'));
      stages.push(stage(
        'ARTIFACT_BINDING',
        'Handoff ↔ adapter binding',
        review.latestIntegrity?.comparison === 'DRIFT' ? 'BLOCKED' : 'ACTION_REQUIRED',
        bindingBlockers[0] ?? 'Current TP-0.59 handoff-to-adapter binding is unavailable or stale.',
        { actionLabel: 'Bind current clean scan', actionSurface: 'Training Handoff ↔ Adapter Integrity', blockers: bindingBlockers },
      ));
    }

    if (candidate.status === 'BENCHMARKED_POLICY_PASS' && review.latestBenchmark) {
      stages.push(stage('MIOBENCH', 'MioBench policy', 'COMPLETE', `Benchmark policy PASS is bound to report ${review.latestBenchmark.id}.`));
    } else if (candidate.status === 'BENCHMARKED_POLICY_FAIL') {
      const benchmarkBlockers = review.blockingReasons.filter((reason) => reason.startsWith('Benchmark policy:'));
      stages.push(stage(
        'MIOBENCH',
        'MioBench policy',
        'BLOCKED',
        benchmarkBlockers[0] ?? 'Latest MioBench result does not satisfy the candidate benchmark policy.',
        { actionLabel: 'Improve/re-evaluate candidate', actionSurface: 'Native Model Candidate Lab', blockers: benchmarkBlockers },
      ));
    } else {
      stages.push(stage(
        'MIOBENCH',
        'MioBench policy',
        'ACTION_REQUIRED',
        'Candidate has not recorded a benchmark policy pass.',
        { actionLabel: 'Run candidate MioBench', actionSurface: 'Native Model Candidate Lab' },
      ));
    }

    if (manifest.lifecycle === 'RELEASE_CANDIDATE' || manifest.lifecycle === 'PROMOTED' || manifest.lifecycle === 'RETIRED') {
      stages.push(stage('RELEASE_REVIEW', 'Release-candidate review', 'COMPLETE', `Lifecycle has advanced beyond EXPERIMENTAL to ${manifest.lifecycle}.`));
    } else if (review.releaseCandidateEligible) {
      stages.push(stage(
        'RELEASE_REVIEW',
        'Release-candidate review',
        'ACTION_REQUIRED',
        'All current release-candidate eligibility checks pass; explicit data-governance and security attestations are still required.',
        { actionLabel: 'Complete explicit release review', actionSurface: 'Training Candidate Review' },
      ));
    } else {
      stages.push(stage(
        'RELEASE_REVIEW',
        'Release-candidate review',
        'PENDING',
        'Release review waits for the earlier evidence gates to become eligible.',
        { blockers: review.blockingReasons },
      ));
    }

    if (!review.latestProvenance) {
      stages.push(stage(
        'SIGNED_PROVENANCE',
        'Signed artifact provenance',
        'OPTIONAL',
        'No signed provenance is attached. Current policy treats provenance as optional until it is introduced; once present it must remain valid and trusted.',
        { actionLabel: 'Optionally attach signed provenance', actionSurface: 'Model Provenance' },
      ));
    } else if (review.provenanceSignerStatus === 'TRUSTED') {
      stages.push(stage('SIGNED_PROVENANCE', 'Signed artifact provenance', 'COMPLETE', `Signed provenance ${review.latestProvenance.id} is bound to signer ${review.latestProvenance.signerKeyId}, currently TRUSTED.`));
    } else {
      const provenanceBlockers = review.blockingReasons.filter((reason) => reason.toLowerCase().includes('provenance') || reason.toLowerCase().includes('signer'));
      stages.push(stage(
        'SIGNED_PROVENANCE',
        'Signed artifact provenance',
        'BLOCKED',
        provenanceBlockers[0] ?? 'Signed provenance exists but its current trust/binding is not valid.',
        { actionLabel: 'Review signer/provenance', actionSurface: 'Model Provenance / Signer Trust', blockers: provenanceBlockers },
      ));
    }

    if (manifest.lifecycle === 'PROMOTED' || manifest.lifecycle === 'RETIRED') {
      stages.push(stage('PROMOTION', 'Final model promotion', 'COMPLETE', `Lifecycle is ${manifest.lifecycle}; explicit promotion has already occurred.`));
    } else if (manifest.lifecycle === 'RELEASE_CANDIDATE') {
      const promotion = await this.promotions.inspect(manifest.id);
      if (promotion?.promotionEligible) {
        stages.push(stage(
          'PROMOTION',
          'Final model promotion',
          'ACTION_REQUIRED',
          'All current promotion checks pass; a separate named promoter and final attestation are still required.',
          { actionLabel: 'Run explicit final promotion gate', actionSurface: 'Training Candidate / Promotion' },
        ));
      } else {
        stages.push(stage(
          'PROMOTION',
          'Final model promotion',
          'BLOCKED',
          promotion?.blockingReasons[0] ?? 'Promotion gate is not currently eligible.',
          { actionLabel: 'Resolve promotion blockers', actionSurface: 'Training Candidate / Promotion', blockers: promotion?.blockingReasons ?? [] },
        ));
      }
    } else {
      stages.push(stage('PROMOTION', 'Final model promotion', 'PENDING', 'Final promotion is available only after RELEASE_CANDIDATE review.'));
    }

    let postPromotionComplete = false;
    if (manifest.lifecycle === 'PROMOTED') {
      const promotion = manifest.promotion;
      const integrity = review.latestIntegrity;
      if (!promotion?.integrityEvidenceId) {
        stages.push(stage('POST_PROMOTION_INTEGRITY', 'Post-promotion integrity', 'BLOCKED', 'Structured promotion provenance has no adapter-integrity evidence reference.'));
      } else if (!integrity) {
        stages.push(stage('POST_PROMOTION_INTEGRITY', 'Post-promotion integrity', 'ACTION_REQUIRED', 'A fresh adapter scan is required after promotion.', { actionLabel: 'Run fresh adapter integrity scan', actionSurface: 'Native Model Candidate Lab' }));
      } else if (integrity.comparison === 'DRIFT') {
        stages.push(stage('POST_PROMOTION_INTEGRITY', 'Post-promotion integrity', 'BLOCKED', 'Latest post-promotion adapter scan reports DRIFT.', { blockers: ['Latest adapter byte-integrity evidence reports DRIFT'] }));
      } else if (integrity.id === promotion.integrityEvidenceId || integrity.scannedAt < promotion.promotedAt || integrity.comparison !== 'MATCH') {
        stages.push(stage('POST_PROMOTION_INTEGRITY', 'Post-promotion integrity', 'ACTION_REQUIRED', 'Activation requires a new post-promotion TP-0.50 scan with comparison MATCH.', { actionLabel: 'Run/confirm post-promotion MATCH scan', actionSurface: 'Native Model Candidate Lab' }));
      } else {
        postPromotionComplete = true;
        stages.push(stage('POST_PROMOTION_INTEGRITY', 'Post-promotion integrity', 'COMPLETE', `Fresh post-promotion MATCH evidence ${integrity.id} is available.`));
      }
    } else if (manifest.lifecycle === 'RETIRED') {
      stages.push(stage('POST_PROMOTION_INTEGRITY', 'Post-promotion integrity', 'NOT_APPLICABLE', 'Retired models are not candidates for new activation.'));
    } else {
      stages.push(stage('POST_PROMOTION_INTEGRITY', 'Post-promotion integrity', 'PENDING', 'Post-promotion integrity applies only after explicit PROMOTED lifecycle.'));
    }

    if (manifest.lifecycle === 'RETIRED') {
      stages.push(stage('ACTIVATION', 'MIO Local activation', 'NOT_APPLICABLE', 'Retired models cannot become the active MIO Local model.'));
    } else if (manifest.lifecycle !== 'PROMOTED') {
      stages.push(stage('ACTIVATION', 'MIO Local activation', 'PENDING', 'Activation is available only after explicit promotion.'));
    } else {
      const selected = activePromotedManifestId === manifest.id;
      const configured = selected && config.provider === 'mio_local' && config.model === manifest.runtimeModel;
      if (configured) {
        stages.push(stage('ACTIVATION', 'MIO Local activation', 'COMPLETE', 'This promoted manifest is the active MIO Local model and the router configuration matches its runtime identity.'));
      } else if (!postPromotionComplete) {
        stages.push(stage('ACTIVATION', 'MIO Local activation', 'PENDING', 'Activation waits for a fresh post-promotion MATCH scan. The final activation gate will also revalidate binding/provenance and runtime readiness.'));
      } else {
        stages.push(stage(
          'ACTIVATION',
          'MIO Local activation',
          'ACTION_REQUIRED',
          'Run the existing activation gate. It will revalidate promotion-time binding, signed provenance/trust, post-promotion integrity, and live local-runtime readiness before changing ModelRouter.',
          { actionLabel: 'Run promoted-model activation gate', actionSurface: 'Promoted Model Runtime' },
        ));
      }
    }

    const next = firstActionable(stages);
    const hasBlocked = stages.some((item) => item.state === 'BLOCKED');
    const active = stages.find((item) => item.id === 'ACTIVATION')?.state === 'COMPLETE';
    const overallState: CandidateLifecyclePipelineSnapshot['overallState'] = active
      ? 'ACTIVE'
      : hasBlocked
        ? 'BLOCKED'
        : manifest.lifecycle === 'PROMOTED'
          ? 'PROMOTED'
          : 'IN_PROGRESS';

    return {
      schemaVersion: 1,
      candidateId: candidate.id,
      manifestId: manifest.id,
      displayName: manifest.displayName,
      runtimeModel: manifest.runtimeModel,
      lifecycle: manifest.lifecycle,
      candidateStatus: candidate.status,
      stages,
      ...(next ? { nextStageId: next.id, nextAction: next.actionLabel ?? next.detail } : {}),
      overallState,
      refreshedAt: Date.now(),
      disclosure: 'Read-only lifecycle projection assembled from existing MIO governance services. Refresh never changes candidate lifecycle, evidence, promotion state, active-model pointer, or ModelRouter. ACTION_REQUIRED means run the named existing gate; it is not a pre-approval or guarantee that the gate will pass.',
    };
  }
}

export const candidateLifecyclePipelineService = new CandidateLifecyclePipelineService();
