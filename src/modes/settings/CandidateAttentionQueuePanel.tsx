import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, CircleDot, ListTodo, RefreshCw } from 'lucide-react';
import {
  candidateAttentionQueueService,
  type CandidateAttentionClass,
  type CandidateAttentionQueueSummary,
} from '../../training/CandidateAttentionQueueService';
import {
  lifecycleSurfaceIdForLabel,
  navigateToCandidateLifecycleSurface,
} from './CandidateLifecycleNavigation';
import { subscribeCandidateLifecycleRefresh } from './CandidateLifecycleRefreshCoordinator';

type AttentionFilter = 'ALL' | CandidateAttentionClass;

export const CandidateAttentionQueuePanel: React.FC = () => {
  const [summary, setSummary] = useState<CandidateAttentionQueueSummary | null>(null);
  const [filter, setFilter] = useState<AttentionFilter>('ALL');
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
      const next = await candidateAttentionQueueService.list(100);
      if (requestId === requestSequence.current) setSummary(next);
    } catch (error) {
      if (requestId === requestSequence.current) {
        setMessage(error instanceof Error ? error.message : 'Candidate attention queue could not be assembled');
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

  const items = useMemo(() => {
    if (!summary) return [];
    return filter === 'ALL' ? summary.items : summary.items.filter((item) => item.attentionClass === filter);
  }, [filter, summary]);

  const filterButton = (value: AttentionFilter, label: string, count?: number) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`rounded border px-2 py-1 text-[9px] font-bold ${filter === value ? 'border-cyan-500/50 bg-cyan-950/20 text-cyan-300' : 'border-gray-700 text-gray-500 hover:text-gray-300'}`}
    >
      {label}{count === undefined ? '' : ` ${count}`}
    </button>
  );

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-gray-300">
          <ListTodo size={14} className="text-amber-400" /> CANDIDATE ATTENTION QUEUE
          <span className="rounded border border-emerald-500/20 bg-emerald-950/10 px-1.5 py-0.5 text-[8px] text-emerald-300">LIVE SYNC</span>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[9px] text-gray-400 hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
        >
          <RefreshCw size={10} className={busy || liveRefreshing ? 'animate-spin' : ''} /> REFRESH
        </button>
      </div>

      <p className="text-[10px] leading-relaxed text-gray-500">
        Read-only operator queue derived from the governed lifecycle projection. <strong className="text-red-300">BLOCKED</strong> means an existing gate reports a blocker; <strong className="text-cyan-300">ACTION REQUIRED</strong> means an explicit operator step is available. This is not a model-quality ranking, promotion recommendation, or automation queue.
      </p>

      <div className="flex flex-wrap gap-2">
        {filterButton('ALL', 'ALL', summary?.items.length ?? 0)}
        {filterButton('BLOCKED', 'BLOCKED', summary?.blocked ?? 0)}
        {filterButton('ACTION_REQUIRED', 'ACTION', summary?.actionRequired ?? 0)}
      </div>

      {items.length === 0 ? (
        <div className="rounded border border-gray-800 bg-[#080b12] p-3 text-[10px] text-gray-500">
          {summary?.items.length === 0 ? 'No candidate currently requires operator attention.' : 'No candidate matches this attention filter.'}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const blocked = item.attentionClass === 'BLOCKED';
            const navigable = Boolean(lifecycleSurfaceIdForLabel(item.actionSurface));
            return (
              <div key={`${item.candidateId}:${item.stageId}`} className={`rounded-lg border p-3 ${blocked ? 'border-red-500/25 bg-red-950/10' : 'border-cyan-500/20 bg-cyan-950/10'}`}>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-200">
                      {blocked ? <AlertTriangle size={11} className="text-red-300" /> : <CircleDot size={11} className="text-cyan-300" />}
                      <span className="truncate">{item.displayName}</span>
                    </div>
                    <div className="mt-1 text-[9px] text-gray-500"><code>{item.runtimeModel}</code> · {item.lifecycle} · stage <strong className="text-gray-300">{item.stageLabel}</strong></div>
                  </div>
                  <span className={`shrink-0 rounded border px-2 py-1 text-[8px] font-bold ${blocked ? 'border-red-500/30 text-red-300' : 'border-cyan-500/30 text-cyan-300'}`}>{item.attentionClass}</span>
                </div>

                <p className="mt-2 text-[9px] leading-relaxed text-gray-400">{item.detail}</p>
                {item.blockers.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[8px] text-red-300/80">
                    {item.blockers.slice(0, 3).map((blocker) => <li key={blocker}>{blocker}</li>)}
                    {item.blockers.length > 3 && <li>+{item.blockers.length - 3} more blocker(s)</li>}
                  </ul>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.actionLabel && <span className="text-[9px] text-gray-400"><strong>Next:</strong> {item.actionLabel}</span>}
                  {navigable && (
                    <button
                      type="button"
                      onClick={() => navigateToCandidateLifecycleSurface(item.actionSurface, item.candidateId, item.runtimeModel)}
                      className="ml-auto flex items-center gap-1 rounded border border-cyan-500/30 px-2 py-1 text-[8px] font-bold text-cyan-300 hover:bg-cyan-950/30"
                    >
                      <ArrowDownToLine size={9} /> GO TO CANDIDATE
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {message && <div className="rounded border border-red-500/30 bg-red-950/10 px-3 py-2 text-[10px] text-red-300">{message}</div>}
    </div>
  );
};
