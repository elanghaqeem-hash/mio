import {
  candidateLifecyclePipelineService,
  type CandidateLifecyclePipelineSnapshot,
  type CandidateLifecycleStage,
  type CandidateLifecycleStageId,
} from './CandidateLifecyclePipelineService';

export type CandidateAttentionClass = 'BLOCKED' | 'ACTION_REQUIRED';

export interface CandidateAttentionItem {
  schemaVersion: 1;
  attentionClass: CandidateAttentionClass;
  candidateId: string;
  manifestId: string;
  displayName: string;
  runtimeModel: string;
  lifecycle: CandidateLifecyclePipelineSnapshot['lifecycle'];
  overallState: CandidateLifecyclePipelineSnapshot['overallState'];
  stageId: CandidateLifecycleStageId;
  stageLabel: string;
  detail: string;
  actionLabel?: string;
  actionSurface?: string;
  blockers: string[];
  refreshedAt: number;
  disclosure: string;
}

export interface CandidateAttentionQueueSummary {
  schemaVersion: 1;
  items: CandidateAttentionItem[];
  blocked: number;
  actionRequired: number;
  generatedAt: number;
  disclosure: string;
}

export interface CandidateAttentionQueueOptions {
  snapshotProvider?: (limit: number) => Promise<CandidateLifecyclePipelineSnapshot[]>;
}

const STAGE_ORDER: CandidateLifecycleStageId[] = [
  'REGISTERED',
  'HANDOFF',
  'ADAPTER_INTEGRITY',
  'ARTIFACT_BINDING',
  'MIOBENCH',
  'RELEASE_REVIEW',
  'SIGNED_PROVENANCE',
  'PROMOTION',
  'POST_PROMOTION_INTEGRITY',
  'ACTIVATION',
];

function stageIndex(stageId: CandidateLifecycleStageId): number {
  const index = STAGE_ORDER.indexOf(stageId);
  return index === -1 ? STAGE_ORDER.length : index;
}

function attentionStage(snapshot: CandidateLifecyclePipelineSnapshot): CandidateLifecycleStage | undefined {
  const selected = snapshot.nextStageId
    ? snapshot.stages.find((item) => item.id === snapshot.nextStageId)
    : undefined;
  if (selected?.state === 'BLOCKED' || selected?.state === 'ACTION_REQUIRED') return selected;
  return snapshot.stages.find((item) => item.state === 'BLOCKED' || item.state === 'ACTION_REQUIRED');
}

export function buildCandidateAttentionQueue(
  snapshots: CandidateLifecyclePipelineSnapshot[],
): CandidateAttentionQueueSummary {
  const items: CandidateAttentionItem[] = [];

  for (const snapshot of snapshots) {
    const stage = attentionStage(snapshot);
    if (!stage || (stage.state !== 'BLOCKED' && stage.state !== 'ACTION_REQUIRED')) continue;
    items.push({
      schemaVersion: 1,
      attentionClass: stage.state,
      candidateId: snapshot.candidateId,
      manifestId: snapshot.manifestId,
      displayName: snapshot.displayName,
      runtimeModel: snapshot.runtimeModel,
      lifecycle: snapshot.lifecycle,
      overallState: snapshot.overallState,
      stageId: stage.id,
      stageLabel: stage.label,
      detail: stage.detail,
      ...(stage.actionLabel ? { actionLabel: stage.actionLabel } : {}),
      ...(stage.actionSurface ? { actionSurface: stage.actionSurface } : {}),
      blockers: [...new Set(stage.blockers ?? [])].slice(0, 20),
      refreshedAt: snapshot.refreshedAt,
      disclosure: 'Read-only operator attention item derived from the governed Candidate Lifecycle Pipeline. Attention class is operational state, not a model-quality score or promotion recommendation.',
    });
  }

  items.sort((left, right) => {
    if (left.attentionClass !== right.attentionClass) return left.attentionClass === 'BLOCKED' ? -1 : 1;
    const stageDelta = stageIndex(left.stageId) - stageIndex(right.stageId);
    if (stageDelta !== 0) return stageDelta;
    const modelDelta = left.runtimeModel.localeCompare(right.runtimeModel);
    if (modelDelta !== 0) return modelDelta;
    return left.candidateId.localeCompare(right.candidateId);
  });

  return {
    schemaVersion: 1,
    items,
    blocked: items.filter((item) => item.attentionClass === 'BLOCKED').length,
    actionRequired: items.filter((item) => item.attentionClass === 'ACTION_REQUIRED').length,
    generatedAt: Date.now(),
    disclosure: 'TP-0.69 groups current lifecycle blockers and explicit operator actions. It does not score model quality, predict promotion success, or execute any lifecycle gate.',
  };
}

export class CandidateAttentionQueueService {
  private readonly snapshotProvider: (limit: number) => Promise<CandidateLifecyclePipelineSnapshot[]>;

  constructor(options: CandidateAttentionQueueOptions = {}) {
    this.snapshotProvider = options.snapshotProvider ?? ((limit) => candidateLifecyclePipelineService.list(limit));
  }

  public async list(limit = 100): Promise<CandidateAttentionQueueSummary> {
    const boundedLimit = Math.max(1, Math.min(limit, 500));
    return buildCandidateAttentionQueue(await this.snapshotProvider(boundedLimit));
  }
}

export const candidateAttentionQueueService = new CandidateAttentionQueueService();
