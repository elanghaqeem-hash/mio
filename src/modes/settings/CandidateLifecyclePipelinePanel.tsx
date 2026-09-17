import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownToLine, BadgeCheck, CircleDashed, RefreshCw, Route, ShieldCheck } from 'lucide-react';
import {
  candidateLifecyclePipelineService,
  type CandidateLifecyclePipelineSnapshot,
  type CandidateLifecycleStage,
  type CandidateLifecycleStageState,
} from '../../training/CandidateLifecyclePipelineService';
import {
  lifecycleSurfaceIdForLabel,
  navigateToCandidateLifecycleSurface,
} from './CandidateLifecycleNavigation';
import { subscribeCandidateLifecycleRefresh } from './CandidateLifecycleRefreshCoordinator';

const STATE_LABEL: Record<CandidateLifecycleStageState, string> = {
  COMPLETE: 'COMPLETE',
  ACTION_REQUIRED: 'ACTION',
  BLOCKED: 'BLOCKED',
  PENDING: 'PENDING',
  OPTIONAL: 'OPTIONAL',
  NOT_APPLICABLE: 'N/A',
};

function stateClasses(state: CandidateLifecycleStageState): string {
  if (state === 'COMPLETE') return 'border-emerald-500/30 bg-emerald-950/10 text-emerald-300';
  if (state === 'BLOCKED') return 'border-red-500/30 bg-red-950/10 text-red-300';
  if (state === 'ACTION_REQUIRED') return 'border-cyan-500/30 bg-cyan-950/10 text-cyan-300';
  if (state === 'OPTIONAL') return 'border-violet-500/20 bg-violet-950/10 text-violet-300';
  return 'border-gray-800 bg-[#0a0f18] text-gray-500';
}

function StageIcon({ state }: { state: CandidateLifecycleStageState }) {
  if (state === 'COMPLETE') return <BadgeCheck size={12} />;
  if (state === 'BLOCKED') return <AlertTriangle size={12} />;
  if (state === 'ACTION_REQUIRED') return <Activity size={12} />;
  if (state === 'OPTIONAL') return <ShieldCheck size={12} />;
  return <CircleDashed size={12} />;
}

function StageCard({
  stage,
  candidateId,
  runtimeModel,
}: {
  stage: CandidateLifecycleStage;
  candidateId: string;
  runtimeModel: string;
}) {
  const navigable = Boolean(lifecycleSurfaceIdForLabel(stage.actionSurface));
  return (
    <div className={`rounded border p-2.5 space-y-1.5 ${stateClasses(stage.state)}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 font-bold text-[10px]"><StageIcon state={stage.state} /><span className="truncate">{stage.label}</span></div>
        <span className="shrink-0 rounded border border-current/20 px-1.5 py-0.5 text-[8px] font-bold">{STATE_LABEL[stage.state]}</span>
      </div>
      <p className="text-[9px] leading-relaxed text-gray-400">{stage.detail}</p>
      {stage.actionLabel && (
        <div className="rounded border border-white/5 bg-black/10 px-2 py-1.5 text-[9px] space-y-1.5">
          <div><span className="font-bold">Next:</span> {stage.actionLabel}</div>
          {stage.actionSurface && <span className="block text-gray-500">Surface: {stage.actionSurface}</span>}
          {navigable && (
            <button
              type="button"
              onClick={() => navigateToCandidateLifecycleSurface(stage.actionSurface, candidateId, runtimeModel)}
              className="flex items-center gap-1 rounded border border-cyan-500/30 px-2 py-1 text-[8px] font-bold text-cyan-300 hover:bg-cyan-950/30"
            >
              <ArrowDownToLine size={9} /> GO TO CANDIDATE
            </button>
          )}
        </div>
      )}
      {stage.blockers && stage.blockers.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-[8px] text-red-300/80">
          {stage.blockers.slice(0, 3).map((blocker) => <li key={blocker}>{blocker}</li>)}
          {stage.blockers.length > 3 && <li>+{stage.blockers.length - 3} more blocker(s)</li>}
        </ul>
      )}
    </div>
  );
}

export const CandidateLifecyclePipelinePanel: React.FC = () => {
  const [snapshots, setSnapshots] = useState<CandidateLifecyclePipelineSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const backgroundSequence = useRef(0);

  const refresh = useCallback(async (background = false) => {
    const requestId = ++requestSequence.current;
    const backgroundId = background ? ++backgroundSequence.current : 0;
    if (background) setLiveRefreshing(true);
    else setBusy(true);
    setMessage(null);
    try {
      const next = await candidateLifecyclePipelineService.list(50);
      if (requestId === requestSequence.current) setSnapshots(next);
    } catch (error) {
      if (requestId === requestSequence.current) {
        setMessage(error instanceof Error ? error.message : 'Candidate lifecycle pipeline could not be assembled');
      }
    } finally {
      if (background) {
        if (backgroundId === backgroundSequence.current) setLiveRefreshing(false);
      } else {
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => subscribeCandidateLifecycleRefresh(() => { void refresh(true); }), [refresh]);

  const summary = useMemo(() => ({
    total: snapshots.length,
    blocked: snapshots.filter((item) => item.overallState === 'BLOCKED').length,
    promoted: snapshots.filter((item) => item.overallState === 'PROMOTED').length,
    active: snapshots.filter((item) => item.overallState === 'ACTIVE').length,
  }), [snapshots]);

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-gray-300">
          <Route size={14} className="text-cyan-400" /> CANDIDATE LIFECYCLE PIPELINE
          <span className="rounded border border-emerald-500/20 bg-emerald-950/10 px-1.5 py-0.5 text-[8px] text-emerald-300">LIVE SYNC</span>
        </div>
        <button onClick={() => void refresh()} disabled={busy} className="flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[9px] text-gray-400 hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"><RefreshCw size={10} className={busy || liveRefreshing ? 'animate-spin' : ''} /> REFRESH</button>
      </div>

      <p className="text-[10px] leading-relaxed text-gray-500">
        Read-only operational map of the governed model lifecycle. It reuses the existing review/promotion evidence and never advances a lifecycle on refresh. <strong className="text-cyan-300">ACTION</strong> means run the named existing gate; it is not a pre-approval or guarantee that the gate will pass. <strong className="text-cyan-300">GO TO CANDIDATE</strong> only navigates/highlights a unique visible candidate card; ambiguous or missing matches fall back to the panel and never execute the gate. Successful training-namespace persistence and model-router preference changes trigger a debounced read-only refresh automatically.
      </p>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded border border-gray-800 bg-[#111726] p-2.5"><span className="block text-[8px] text-gray-500">CANDIDATES</span><strong className="text-gray-200">{summary.total}</strong></div>
        <div className="rounded border border-gray-800 bg-[#111726] p-2.5"><span className="block text-[8px] text-gray-500">BLOCKED</span><strong className="text-red-300">{summary.blocked}</strong></div>
        <div className="rounded border border-gray-800 bg-[#111726] p-2.5"><span className="block text-[8px] text-gray-500">PROMOTED / NOT ACTIVE</span><strong className="text-violet-300">{summary.promoted}</strong></div>
        <div className="rounded border border-gray-800 bg-[#111726] p-2.5"><span className="block text-[8px] text-gray-500">ACTIVE</span><strong className="text-emerald-300">{summary.active}</strong></div>
      </div>

      {snapshots.length === 0 ? (
        <div className="rounded border border-gray-800 bg-[#080b12] p-3 text-[10px] text-gray-500">No governed training candidates are registered yet.</div>
      ) : snapshots.map((snapshot) => (
        <div key={snapshot.candidateId} className="rounded-xl border border-gray-800 bg-[#080b12] p-3 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-bold text-gray-200">{snapshot.displayName}</div>
              <div className="mt-1 text-[9px] text-gray-500"><code>{snapshot.runtimeModel}</code> · lifecycle <strong className="text-gray-300">{snapshot.lifecycle}</strong> · candidate <strong className="text-gray-300">{snapshot.candidateStatus}</strong></div>
              <div className="mt-1 text-[8px] text-gray-600">Candidate ID: <code>{snapshot.candidateId}</code></div>
            </div>
            <div className={`rounded border px-2 py-1 text-[9px] font-bold ${snapshot.overallState === 'ACTIVE' ? 'border-emerald-500/30 text-emerald-300' : snapshot.overallState === 'BLOCKED' ? 'border-red-500/30 text-red-300' : snapshot.overallState === 'PROMOTED' ? 'border-violet-500/30 text-violet-300' : 'border-cyan-500/30 text-cyan-300'}`}>{snapshot.overallState}</div>
          </div>

          {snapshot.nextAction && (
            <div className="rounded border border-cyan-500/20 bg-cyan-950/10 px-3 py-2 text-[10px] text-cyan-200">
              <strong>Next required action:</strong> {snapshot.nextAction}
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {snapshot.stages.map((item) => (
              <StageCard key={item.id} stage={item} candidateId={snapshot.candidateId} runtimeModel={snapshot.runtimeModel} />
            ))}
          </div>
        </div>
      ))}

      {message && <div className="rounded border border-red-500/30 bg-red-950/10 px-3 py-2 text-[10px] text-red-300">{message}</div>}
    </div>
  );
};
