import {
  buildCandidateAttentionQueue,
  CandidateAttentionQueueService,
} from '../training/CandidateAttentionQueueService';
import type {
  CandidateLifecyclePipelineSnapshot,
  CandidateLifecycleStage,
} from '../training/CandidateLifecyclePipelineService';

function snapshot(input: {
  candidateId: string;
  runtimeModel: string;
  overallState: CandidateLifecyclePipelineSnapshot['overallState'];
  nextStageId?: CandidateLifecyclePipelineSnapshot['nextStageId'];
  stages: CandidateLifecycleStage[];
}): CandidateLifecyclePipelineSnapshot {
  return {
    schemaVersion: 1,
    candidateId: input.candidateId,
    manifestId: `manifest:${input.candidateId}`,
    displayName: input.runtimeModel,
    runtimeModel: input.runtimeModel,
    lifecycle: input.overallState === 'PROMOTED' || input.overallState === 'ACTIVE' ? 'PROMOTED' : 'EXPERIMENTAL',
    candidateStatus: 'REGISTERED_UNEVALUATED',
    stages: input.stages,
    ...(input.nextStageId ? { nextStageId: input.nextStageId } : {}),
    nextAction: input.stages.find((stage) => stage.id === input.nextStageId)?.actionLabel,
    overallState: input.overallState,
    refreshedAt: 1_789_607_000_000,
    disclosure: 'synthetic test snapshot',
  };
}

function stage(
  id: CandidateLifecycleStage['id'],
  state: CandidateLifecycleStage['state'],
  actionLabel?: string,
  blockers: string[] = [],
): CandidateLifecycleStage {
  return {
    id,
    label: id,
    state,
    detail: `${id} ${state}`,
    ...(actionLabel ? { actionLabel, actionSurface: 'Native Model Candidate Lab' } : {}),
    ...(blockers.length ? { blockers } : {}),
  };
}

export async function runCandidateAttentionQueueTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ [PASS] ${name}`);
    } else {
      console.error(`✗ [FAIL] ${name}`);
    }
  };

  const snapshots: CandidateLifecyclePipelineSnapshot[] = [
    snapshot({
      candidateId: 'candidate:active',
      runtimeModel: 'Mio-Active',
      overallState: 'ACTIVE',
      stages: [stage('ACTIVATION', 'COMPLETE')],
    }),
    snapshot({
      candidateId: 'candidate:activation',
      runtimeModel: 'Mio-Promoted',
      overallState: 'PROMOTED',
      nextStageId: 'ACTIVATION',
      stages: [stage('ACTIVATION', 'ACTION_REQUIRED', 'Activate promoted model')],
    }),
    snapshot({
      candidateId: 'candidate:benchmark',
      runtimeModel: 'Mio-Benchmark',
      overallState: 'IN_PROGRESS',
      nextStageId: 'MIOBENCH',
      stages: [stage('MIOBENCH', 'ACTION_REQUIRED', 'Run candidate MioBench')],
    }),
    snapshot({
      candidateId: 'candidate:drift',
      runtimeModel: 'Mio-Drift',
      overallState: 'BLOCKED',
      nextStageId: 'ADAPTER_INTEGRITY',
      stages: [stage('ADAPTER_INTEGRITY', 'BLOCKED', 'Resolve artifact drift and re-scan', ['Latest adapter byte-integrity evidence reports DRIFT'])],
    }),
    snapshot({
      candidateId: 'candidate:pending',
      runtimeModel: 'Mio-Pending',
      overallState: 'IN_PROGRESS',
      stages: [stage('RELEASE_REVIEW', 'PENDING')],
    }),
  ];

  const queue = buildCandidateAttentionQueue(snapshots);
  assert(queue.items.length === 3, 'Attention queue includes only BLOCKED or ACTION_REQUIRED candidates');
  assert(queue.blocked === 1 && queue.actionRequired === 2, 'Attention queue reports blocked/action counts without quality scoring');
  assert(queue.items[0].candidateId === 'candidate:drift' && queue.items[0].attentionClass === 'BLOCKED', 'BLOCKED operational state is grouped before operator actions');
  assert(queue.items[1].candidateId === 'candidate:benchmark' && queue.items[2].candidateId === 'candidate:activation', 'ACTION_REQUIRED items follow deterministic lifecycle stage order');
  assert(!queue.items.some((item) => item.candidateId === 'candidate:active'), 'Healthy ACTIVE candidate is omitted from operator attention queue');
  assert(!queue.items.some((item) => item.candidateId === 'candidate:pending'), 'PENDING-only candidate is not misrepresented as an executable operator action');
  assert(queue.items[0].blockers.length === 1 && queue.items[0].blockers[0].includes('DRIFT'), 'Existing lifecycle blockers are preserved descriptively');
  assert(queue.disclosure.includes('does not score model quality'), 'Queue disclosure explicitly rejects model-quality scoring');

  let providerCalls = 0;
  const service = new CandidateAttentionQueueService({
    snapshotProvider: async (limit) => {
      providerCalls += 1;
      assert(limit === 7, 'Attention service forwards bounded read limit to snapshot provider');
      return snapshots;
    },
  });
  const serviceQueue = await service.list(7);
  assert(providerCalls === 1, 'Attention service performs one read-only snapshot-provider call');
  assert(serviceQueue.items.map((item) => item.candidateId).join('|') === queue.items.map((item) => item.candidateId).join('|'), 'Service output matches pure attention projection');

  return { passed, total };
}
