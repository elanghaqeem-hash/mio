import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BadgeCheck, BrainCircuit, RefreshCw, Rocket } from 'lucide-react';
import { systemPreferences } from '../../settings/SystemPreferences';
import { MioModelManifest } from '../../training/ModelManifest';
import {
  PromotedModelRuntimeStatus,
  promotedModelActivationService,
} from '../../training/PromotedModelActivationService';
import { CandidateAttentionQueuePanel } from './CandidateAttentionQueuePanel';
import { CandidateLifecyclePipelinePanel } from './CandidateLifecyclePipelinePanel';
import { CANDIDATE_LIFECYCLE_SURFACE_IDS } from './CandidateLifecycleNavigation';
import { subscribeCandidateLifecycleRefresh } from './CandidateLifecycleRefreshCoordinator';
import { ModelPromotionPanel } from './ModelPromotionPanel';

export const PromotedModelPanel: React.FC = () => {
  const [status, setStatus] = useState<PromotedModelRuntimeStatus | null>(null);
  const [models, setModels] = useState<MioModelManifest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const backgroundSequence = useRef(0);

  const refresh = useCallback(async (background = false) => {
    const requestId = ++requestSequence.current;
    const backgroundId = background ? ++backgroundSequence.current : 0;
    if (background) setLiveRefreshing(true);
    else setRefreshing(true);
    try {
      const [nextStatus, promoted] = await Promise.all([
        promotedModelActivationService.status(),
        promotedModelActivationService.listPromoted(),
      ]);
      if (requestId === requestSequence.current) {
        setStatus(nextStatus);
        setModels(promoted);
      }
    } catch (error) {
      if (requestId === requestSequence.current) {
        setMessage(error instanceof Error ? error.message : 'Promoted model runtime status refresh failed');
      }
    } finally {
      if (background) {
        if (backgroundId === backgroundSequence.current) setLiveRefreshing(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeCandidateLifecycleRefresh(() => { void refresh(true); });
  }, [refresh]);

  const activate = async (manifest: MioModelManifest) => {
    setBusy(manifest.id);
    setMessage(null);
    try {
      const current = systemPreferences.getSnapshot().modelRouter;
      const result = await promotedModelActivationService.activatePromoted(manifest.id, {
        backend: current.mioLocalBackend ?? 'ollama',
        endpoint: current.mioLocalEndpoint,
      });
      const evidence = [
        result.integrityEvidenceId ? `Integrity evidence: ${result.integrityEvidenceId}.` : '',
        result.provenanceEvidenceId ? `Signed provenance: ${result.provenanceEvidenceId}.` : '',
      ].filter(Boolean).join(' ');
      setMessage(`Activated ${result.manifest.displayName} through ${result.backend}: ${result.readinessDetail}${evidence ? ` ${evidence}` : ''}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Promoted model activation failed');
    } finally {
      setBusy(null);
    }
  };

  const stateClass = status?.state === 'ACTIVE'
    ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
    : status?.state === 'INTEGRITY_BLOCKED'
      ? 'border-red-500/40 bg-red-950/20 text-red-300'
      : status?.state === 'CONFIGURATION_DRIFT'
        ? 'border-amber-500/40 bg-amber-950/20 text-amber-300'
        : 'border-gray-700 bg-[#111726] text-gray-300';

  return (
    <>
      <CandidateAttentionQueuePanel />
      <CandidateLifecyclePipelinePanel />
      <section id={CANDIDATE_LIFECYCLE_SURFACE_IDS.FINAL_PROMOTION} className="scroll-mt-4 outline-none">
        <ModelPromotionPanel onPromoted={() => refresh()} />
      </section>
      <div id={CANDIDATE_LIFECYCLE_SURFACE_IDS.PROMOTED_RUNTIME} className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3 scroll-mt-4 outline-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-gray-300 font-bold flex items-center gap-2">
            <BrainCircuit size={14} className="text-cyan-400" /> MIO LOCAL MODEL LIFECYCLE
            <span className="rounded border border-emerald-500/20 bg-emerald-950/10 px-1.5 py-0.5 text-[8px] text-emerald-300">LIVE SYNC</span>
          </span>
          <button onClick={() => void refresh()} disabled={refreshing} className="flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[10px] text-gray-300 hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-50">
            <RefreshCw size={11} className={refreshing || liveRefreshing ? 'animate-spin' : ''} /> REFRESH
          </button>
        </div>

        <p className="text-gray-500 text-[10px] leading-relaxed">
          Only PROMOTED model manifests can be activated. Governed adapter candidates require a fresh post-promotion byte-integrity MATCH plus local runtime readiness. If signed provenance was bound at promotion, its exact evidence and current signer trust are also revalidated before MIO changes the active local model. Promotion and activation remain separate explicit actions. Persisted lifecycle evidence and model-router preference changes refresh this status read-only; live runtime readiness is checked only during explicit activation.
        </p>

        <div className={`rounded-lg border px-3 py-2 text-[10px] ${stateClass}`}>
          <div className="flex items-center gap-2 font-bold">
            {status?.state === 'ACTIVE' ? <BadgeCheck size={13} /> : status?.state === 'CONFIGURATION_DRIFT' || status?.state === 'INTEGRITY_BLOCKED' ? <AlertTriangle size={13} /> : <BrainCircuit size={13} />}
            {status?.state ?? 'LOADING'}
          </div>
          <div className="mt-1 opacity-90">{status?.detail ?? 'Reading promoted model registry...'}</div>
          {status?.manifest && (
            <div className="mt-1 opacity-70">Manifest: {status.manifest.id} · Runtime: {status.manifest.runtimeModel}</div>
          )}
        </div>

        {models.length === 0 ? (
          <div className="rounded-lg border border-gray-800 bg-[#111726] p-3 text-[10px] text-gray-500">
            No PROMOTED model manifests are currently available. Train, benchmark, review, and promote a candidate before runtime activation.
          </div>
        ) : (
          <div className="space-y-2">
            {models.map((manifest) => {
              const active = status?.state === 'ACTIVE' && status.manifest?.id === manifest.id;
              return (
                <div key={manifest.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-gray-800 bg-[#111726] p-3">
                  <div className="min-w-0">
                    <div className="font-bold text-gray-200 truncate">{manifest.displayName}</div>
                    <div className="text-[10px] text-gray-500 mt-1 truncate">{manifest.runtimeModel} · base {manifest.baseModel} · {manifest.trainingMethod}</div>
                    <div className="text-[10px] text-gray-600 mt-1">Dataset {manifest.dataset.id} · {manifest.dataset.exampleCount} examples</div>
                    {manifest.promotion && (
                      <div className="text-[9px] text-gray-600 mt-1">
                        Promoted by {manifest.promotion.promoter} · benchmark {manifest.promotion.benchmarkReportId}
                        {manifest.promotion.provenanceEvidenceId ? ` · signed provenance ${manifest.promotion.provenanceEvidenceId}` : ''}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => void activate(manifest)}
                    disabled={busy !== null || active}
                    className={`shrink-0 flex items-center justify-center gap-1.5 rounded border px-3 py-1.5 font-bold text-[10px] disabled:opacity-50 ${active ? 'border-emerald-500/40 text-emerald-300' : 'border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/30'}`}
                  >
                    {active ? <BadgeCheck size={12} /> : <Rocket size={12} />}
                    {active ? 'ACTIVE' : busy === manifest.id ? 'VERIFYING...' : 'ACTIVATE'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {message && <div className="rounded border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-[10px] text-cyan-200">{message}</div>}
      </div>
    </>
  );
};
