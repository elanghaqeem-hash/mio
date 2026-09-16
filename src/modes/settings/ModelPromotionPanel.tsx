import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpCircle, BadgeCheck, Fingerprint, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  type ModelPromotionSnapshot,
  modelPromotionService,
} from '../../training/ModelPromotionService';

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

interface ModelPromotionPanelProps {
  onPromoted?: () => void | Promise<void>;
}

export const ModelPromotionPanel: React.FC<ModelPromotionPanelProps> = ({ onPromoted }) => {
  const [candidates, setCandidates] = useState<ModelPromotionSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [promoter, setPromoter] = useState('');
  const [finalAttestation, setFinalAttestation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCandidates(await modelPromotionService.listReleaseCandidates());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Release-candidate promotion registry could not be read');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selected = useMemo(
    () => candidates.find((snapshot) => snapshot.manifest.id === selectedId),
    [candidates, selectedId],
  );

  const selectForPromotion = (manifestId: string) => {
    setSelectedId(manifestId);
    setPromoter('');
    setFinalAttestation(false);
    setMessage(null);
  };

  const promote = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await modelPromotionService.promote({
        manifestId: selected.manifest.id,
        promoter,
        finalAttestation,
      });
      setMessage(`${result.manifest.displayName} is now PROMOTED using benchmark ${result.benchmarkReportId}. It is not active; verify the local runtime and use ACTIVATE in the lifecycle panel.`);
      setSelectedId(null);
      setPromoter('');
      setFinalAttestation(false);
      await refresh();
      await onPromoted?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Final model promotion failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-gray-300 font-bold flex items-center gap-2">
          <ArrowUpCircle size={14} className="text-emerald-400" /> FINAL MODEL PROMOTION
        </span>
        <button onClick={() => void refresh()} disabled={loading || busy} className="flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[10px] text-gray-300 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> REFRESH
        </button>
      </div>

      <p className="text-gray-500 text-[10px] leading-relaxed">
        RELEASE_CANDIDATE models require a final explicit promotion action. MIO revalidates governance/security review, the bound MioBench report, benchmark policy, and candidate byte-integrity evidence before writing PROMOTED. Promotion never activates the runtime automatically.
      </p>

      {loading ? (
        <div className="rounded-lg border border-gray-800 bg-[#111726] p-3 text-[10px] text-gray-500">Reading release candidates…</div>
      ) : candidates.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-[#111726] p-3 text-[10px] text-gray-500">
          No RELEASE_CANDIDATE model is awaiting final promotion.
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((snapshot) => {
            const selectedRow = selectedId === snapshot.manifest.id;
            const integrity = snapshot.latestIntegrity;
            const integrityClass = integrity?.comparison === 'DRIFT'
              ? 'text-red-300'
              : integrity
                ? 'text-emerald-300'
                : 'text-amber-300';
            return (
              <div key={snapshot.manifest.id} className={`rounded-lg border p-3 space-y-2 ${selectedRow ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-gray-800 bg-[#111726]'}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="font-bold text-gray-200 truncate">{snapshot.manifest.displayName}</div>
                    <div className="mt-1 text-[10px] text-gray-500 truncate">{snapshot.manifest.runtimeModel} · {snapshot.manifest.trainingMethod} · {snapshot.manifest.lifecycle}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[9px]">
                      <span className="rounded border border-emerald-500/30 bg-emerald-950/20 px-2 py-0.5 font-bold text-emerald-300">RELEASE_CANDIDATE</span>
                      <span className={`rounded border border-gray-700 bg-gray-900 px-2 py-0.5 ${integrityClass}`}><Fingerprint size={9} className="inline mr-1" />{integrity?.comparison ?? 'INTEGRITY REQUIRED'}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => selectForPromotion(snapshot.manifest.id)}
                    disabled={!snapshot.promotionEligible || busy}
                    className="shrink-0 flex items-center justify-center gap-1.5 rounded border border-emerald-500/40 px-3 py-1.5 font-bold text-[10px] text-emerald-300 hover:bg-emerald-950/30 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-600"
                  >
                    <ShieldCheck size={12} /> {snapshot.promotionEligible ? 'FINAL PROMOTION REVIEW' : 'PROMOTION BLOCKED'}
                  </button>
                </div>

                {snapshot.latestBenchmark && (
                  <div className="text-[9px] text-gray-500">
                    MioBench: {snapshot.latestBenchmark.report.model} · pass {pct(snapshot.latestBenchmark.report.passRate)} · score {pct(snapshot.latestBenchmark.report.maxScore > 0 ? snapshot.latestBenchmark.report.score / snapshot.latestBenchmark.report.maxScore : 0)} · report {snapshot.latestBenchmark.id}
                  </div>
                )}
                {integrity && (
                  <div className="text-[9px] text-gray-500">
                    Adapter fingerprint: <code>{integrity.fingerprint.slice(0, 20)}…</code> · baseline <code>{integrity.baselineFingerprint.slice(0, 20)}…</code>
                  </div>
                )}

                {snapshot.blockingReasons.length > 0 && (
                  <div className="rounded border border-amber-500/20 bg-amber-950/10 p-2 text-[9px] text-amber-300">
                    <div className="mb-1 flex items-center gap-1 font-bold"><AlertTriangle size={10} /> PROMOTION BLOCKED</div>
                    <ul className="list-disc pl-4 space-y-0.5">{snapshot.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/10 p-3 space-y-3">
          <div className="font-bold text-emerald-300 flex items-center gap-2"><BadgeCheck size={13} /> EXPLICIT FINAL PROMOTION ATTESTATION</div>
          <p className="text-[10px] text-gray-400">
            Model: <span className="text-gray-200">{selected.manifest.displayName}</span>. Promotion makes this manifest eligible for the separate runtime activation workflow, but does not start, deploy, or switch the model itself.
          </p>
          <input
            value={promoter}
            onChange={(event) => setPromoter(event.target.value)}
            placeholder="Promoter / final review identity"
            maxLength={200}
            className="w-full rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white outline-none focus:border-emerald-500"
          />
          <label className="flex items-start gap-2 rounded border border-gray-800 bg-[#111726] p-2.5 cursor-pointer">
            <input type="checkbox" checked={finalAttestation} onChange={(event) => setFinalAttestation(event.target.checked)} className="mt-0.5 accent-emerald-400" />
            <span className="text-[10px] text-gray-300"><strong>Final promotion review completed.</strong> I confirm that the bound MioBench report, governance/security reviews, candidate identity, and adapter byte-integrity evidence shown by MIO are the intended evidence for this promotion.</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setSelectedId(null)} disabled={busy} className="rounded border border-gray-700 px-3 py-2 text-[10px] font-bold text-gray-400 hover:text-gray-200 disabled:opacity-50">CANCEL</button>
            <button
              onClick={() => void promote()}
              disabled={busy || !promoter.trim() || !finalAttestation || !selected.promotionEligible}
              className="rounded border border-emerald-500/50 bg-emerald-950/20 px-3 py-2 text-[10px] font-bold text-emerald-200 hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-transparent disabled:text-gray-600"
            >
              {busy ? 'REVALIDATING…' : 'PROMOTE MODEL'}
            </button>
          </div>
        </div>
      )}

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-950/10 px-3 py-2 text-[10px] text-emerald-200">{message}</div>}
    </div>
  );
};
