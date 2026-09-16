import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Link2, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  trainingArtifactBindingService,
  type TrainingArtifactBindingSnapshot,
} from '../../training/TrainingArtifactBindingService';
import { trainingCandidateReviewService } from '../../training/TrainingCandidateReviewService';

export const TrainingArtifactBindingPanel: React.FC = () => {
  const [snapshots, setSnapshots] = useState<TrainingArtifactBindingSnapshot[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const candidates = await trainingCandidateReviewService.list();
      const handoffCandidates = candidates.filter((candidate) => candidate.handoffReceipt);
      const next = await Promise.all(handoffCandidates.map((candidate) => trainingArtifactBindingService.inspect(candidate.candidate.id)));
      setSnapshots(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Training artifact bindings could not be read');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const bind = async (candidateId: string) => {
    setBusy(candidateId);
    setMessage(null);
    try {
      const binding = await trainingArtifactBindingService.bind(candidateId);
      setMessage(`Bound TP-0.58 handoff to adapter integrity evidence ${binding.integrityEvidenceId}. Binding SHA-256 ${binding.bindingSha256.slice(0, 20)}…`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Training artifact binding failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-gray-300 font-bold flex items-center gap-2"><Link2 size={14} className="text-cyan-400" /> TRAINING HANDOFF ↔ ADAPTER INTEGRITY</span>
        <button onClick={() => void refresh()} disabled={loading || busy !== null} className="flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[10px] text-gray-300 hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-50">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> REFRESH
        </button>
      </div>
      <p className="text-[10px] leading-relaxed text-gray-500">
        TP-0.59 binds a verified TP-0.58 training handoff receipt to the latest TP-0.50 adapter byte-integrity scan. A later scan makes the previous binding stale, even when the fingerprint still matches, so release review and promotion always reference the current scan evidence.
      </p>

      {loading ? (
        <div className="rounded border border-gray-800 bg-[#111726] p-3 text-[10px] text-gray-500">Reading handoff and integrity evidence…</div>
      ) : snapshots.length === 0 ? (
        <div className="rounded border border-gray-800 bg-[#111726] p-3 text-[10px] text-gray-500">No TP-0.58 handoff-registered candidates are available. Import a governed training-run handoff first.</div>
      ) : (
        <div className="space-y-2">
          {snapshots.map((snapshot) => {
            const candidate = snapshot.candidate;
            const manifest = snapshot.manifest;
            if (!candidate || !manifest) return null;
            const binding = snapshot.latestBinding;
            const integrity = snapshot.latestIntegrity;
            return (
              <div key={candidate.id} className="rounded-lg border border-gray-800 bg-[#111726] p-3 space-y-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="font-bold text-gray-200 truncate">{manifest.displayName}</div>
                    <div className="mt-1 text-[9px] text-gray-500 truncate">{manifest.runtimeModel} · {candidate.artifactUri}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
                      <span className="rounded border border-cyan-500/30 px-2 py-0.5 text-cyan-300">HANDOFF {snapshot.receipt?.handoffSha256.slice(0, 12)}…</span>
                      <span className={`rounded border px-2 py-0.5 ${integrity?.comparison === 'DRIFT' ? 'border-red-500/30 text-red-300' : integrity ? 'border-emerald-500/30 text-emerald-300' : 'border-gray-700 text-gray-500'}`}>
                        INTEGRITY {integrity?.comparison ?? 'MISSING'}
                      </span>
                      <span className={`rounded border px-2 py-0.5 ${snapshot.bindingValid ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}`}>
                        BINDING {snapshot.bindingValid ? 'CURRENT' : binding ? 'STALE' : 'MISSING'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => void bind(candidate.id)}
                    disabled={!snapshot.bindable || busy !== null || snapshot.bindingValid}
                    className="shrink-0 flex items-center justify-center gap-1.5 rounded border border-cyan-500/40 px-3 py-1.5 text-[10px] font-bold text-cyan-300 hover:bg-cyan-950/20 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-600"
                  >
                    <Fingerprint size={12} /> {busy === candidate.id ? 'BINDING…' : snapshot.bindingValid ? 'BOUND CURRENT' : 'BIND CURRENT SCAN'}
                  </button>
                </div>

                {binding && (
                  <div className="text-[9px] text-gray-500">Binding: <code>{binding.bindingSha256.slice(0, 20)}…</code> · scan <code>{binding.integrityEvidenceId}</code></div>
                )}
                {!snapshot.bindable && snapshot.blockingReasons.length > 0 && (
                  <div className="rounded border border-amber-500/20 bg-amber-950/10 p-2 text-[9px] text-amber-300">
                    <div className="mb-1 flex items-center gap-1 font-bold"><ShieldAlert size={10} /> BINDING BLOCKED</div>
                    <ul className="list-disc pl-4 space-y-0.5">{snapshot.blockingReasons.slice(0, 6).map((reason) => <li key={reason}>{reason}</li>)}</ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {message && <div className="rounded border border-cyan-500/30 bg-cyan-950/10 px-3 py-2 text-[10px] text-cyan-200">{message}</div>}
    </div>
  );
};
