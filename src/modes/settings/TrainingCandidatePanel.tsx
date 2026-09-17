import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, ClipboardCheck, FlaskConical, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  TrainingCandidateReviewSnapshot,
  trainingCandidateReviewService,
} from '../../training/TrainingCandidateReviewService';

export const TrainingCandidatePanel: React.FC = () => {
  const [candidates, setCandidates] = useState<TrainingCandidateReviewSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState('');
  const [dataGovernanceAttested, setDataGovernanceAttested] = useState(false);
  const [securityAttested, setSecurityAttested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCandidates(await trainingCandidateReviewService.list());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Candidate registry could not be read');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selected = useMemo(
    () => candidates.find((snapshot) => snapshot.candidate.id === selectedId),
    [candidates, selectedId],
  );

  const selectForReview = (candidateId: string) => {
    setSelectedId(candidateId);
    setReviewer('');
    setDataGovernanceAttested(false);
    setSecurityAttested(false);
    setMessage(null);
  };

  const advance = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await trainingCandidateReviewService.advanceToReleaseCandidate({
        candidateId: selected.candidate.id,
        reviewer,
        dataGovernanceAttested,
        securityAttested,
      });
      setMessage(`${result.manifest.displayName} advanced to RELEASE_CANDIDATE using benchmark ${result.benchmarkReportId}. It is not promoted or active.`);
      setSelectedId(null);
      setReviewer('');
      setDataGovernanceAttested(false);
      setSecurityAttested(false);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Release-candidate review failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-gray-300 font-bold flex items-center gap-2">
          <FlaskConical size={14} className="text-violet-400" /> TRAINING CANDIDATES &amp; RELEASE REVIEW
        </span>
        <button onClick={() => void refresh()} disabled={loading || busy} className="flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[10px] text-gray-300 hover:border-violet-500/50 hover:text-violet-300 disabled:opacity-50">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> REFRESH
        </button>
      </div>

      <p className="text-gray-500 text-[10px] leading-relaxed">
        Training results enter MIO as EXPERIMENTAL candidates. A candidate can become RELEASE_CANDIDATE only after an identity-matched MioBench policy pass plus explicit data-governance and security attestations. Existing adapter-integrity and signed-provenance evidence are also revalidated when present. This panel never promotes or activates a model.
      </p>

      {loading ? (
        <div className="rounded-lg border border-gray-800 bg-[#111726] p-3 text-[10px] text-gray-500">Reading governed candidate registry…</div>
      ) : candidates.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-[#111726] p-3 text-[10px] text-gray-500">
          No registered training candidates. Export and train a governed TP-0.46 bundle, then register the training result before review.
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((snapshot) => {
            const reviewable = snapshot.releaseCandidateEligible && snapshot.manifest.lifecycle === 'EXPERIMENTAL';
            const isSelected = selectedId === snapshot.candidate.id;
            const lifecycleClass = snapshot.manifest.lifecycle === 'RELEASE_CANDIDATE'
              ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
              : snapshot.candidate.status === 'BENCHMARKED_POLICY_PASS'
                ? 'border-cyan-500/30 bg-cyan-950/20 text-cyan-300'
                : snapshot.candidate.status === 'BENCHMARKED_POLICY_FAIL'
                  ? 'border-red-500/30 bg-red-950/20 text-red-300'
                  : 'border-gray-700 bg-gray-900 text-gray-400';
            return (
              <div key={snapshot.candidate.id} className={`rounded-lg border p-3 space-y-2 ${isSelected ? 'border-violet-500/50 bg-violet-950/10' : 'border-gray-800 bg-[#111726]'}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="font-bold text-gray-200 truncate">{snapshot.manifest.displayName}</div>
                    <div className="mt-1 text-[10px] text-gray-500 truncate">{snapshot.manifest.runtimeModel} · {snapshot.manifest.trainingMethod} · base {snapshot.manifest.baseModel}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[9px]">
                      <span className={`rounded border px-2 py-0.5 font-bold ${lifecycleClass}`}>{snapshot.manifest.lifecycle}</span>
                      <span className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-gray-400">{snapshot.candidate.status}</span>
                      <span className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-gray-500">{snapshot.manifest.dataset.exampleCount} EXAMPLES</span>
                      {snapshot.latestIntegrity && <span className={`rounded border px-2 py-0.5 ${snapshot.latestIntegrity.comparison === 'DRIFT' ? 'border-red-500/30 text-red-300' : 'border-cyan-500/30 text-cyan-300'}`}>INTEGRITY {snapshot.latestIntegrity.comparison}</span>}
                      {snapshot.latestProvenance && <span className={`rounded border px-2 py-0.5 ${snapshot.provenanceSignerStatus === 'TRUSTED' ? 'border-emerald-500/30 text-emerald-300' : 'border-red-500/30 text-red-300'}`}>SIGNED {snapshot.provenanceSignerStatus ?? 'UNKNOWN'}</span>}
                    </div>
                  </div>
                  {snapshot.manifest.lifecycle === 'EXPERIMENTAL' && (
                    <button
                      onClick={() => selectForReview(snapshot.candidate.id)}
                      disabled={!reviewable || busy}
                      className="shrink-0 flex items-center justify-center gap-1.5 rounded border border-violet-500/40 px-3 py-1.5 font-bold text-[10px] text-violet-300 hover:bg-violet-950/30 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-600"
                    >
                      <ClipboardCheck size={12} /> {reviewable ? 'REVIEW FOR RC' : 'NOT READY'}
                    </button>
                  )}
                  {snapshot.manifest.lifecycle === 'RELEASE_CANDIDATE' && (
                    <span className="shrink-0 flex items-center gap-1.5 rounded border border-emerald-500/30 px-3 py-1.5 text-[10px] font-bold text-emerald-300"><BadgeCheck size={12} /> REVIEWED RC</span>
                  )}
                </div>

                {snapshot.latestBenchmark && (
                  <div className="text-[9px] text-gray-500">
                    Benchmark: {snapshot.latestBenchmark.report.model} · pass {(snapshot.latestBenchmark.report.passRate * 100).toFixed(0)}% · report {snapshot.latestBenchmark.id}
                  </div>
                )}

                {snapshot.blockingReasons.length > 0 && snapshot.manifest.lifecycle === 'EXPERIMENTAL' && (
                  <div className="rounded border border-amber-500/20 bg-amber-950/10 p-2 text-[9px] text-amber-300">
                    <div className="mb-1 flex items-center gap-1 font-bold"><AlertTriangle size={10} /> RELEASE REVIEW BLOCKED</div>
                    <ul className="list-disc pl-4 space-y-0.5">{snapshot.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="rounded-lg border border-violet-500/30 bg-violet-950/10 p-3 space-y-3">
          <div className="font-bold text-violet-300 flex items-center gap-2"><ShieldCheck size={13} /> EXPLICIT RELEASE-CANDIDATE ATTESTATION</div>
          <p className="text-[10px] text-gray-400">Candidate: <span className="text-gray-200">{selected.manifest.displayName}</span>. These attestations record that a human reviewer has completed both required reviews. They do not promote or activate the model.</p>
          <input
            value={reviewer}
            onChange={(event) => setReviewer(event.target.value)}
            placeholder="Reviewer name / review identity"
            maxLength={200}
            className="w-full rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500"
          />
          <label className="flex items-start gap-2 rounded border border-gray-800 bg-[#111726] p-2.5 cursor-pointer">
            <input type="checkbox" checked={dataGovernanceAttested} onChange={(event) => setDataGovernanceAttested(event.target.checked)} className="mt-0.5 accent-violet-400" />
            <span className="text-[10px] text-gray-300"><strong>Data-governance review completed.</strong> Dataset provenance, privacy/copyright eligibility, bundle fingerprints, training-result binding, and applicable signed-artifact provenance have been reviewed.</span>
          </label>
          <label className="flex items-start gap-2 rounded border border-gray-800 bg-[#111726] p-2.5 cursor-pointer">
            <input type="checkbox" checked={securityAttested} onChange={(event) => setSecurityAttested(event.target.checked)} className="mt-0.5 accent-violet-400" />
            <span className="text-[10px] text-gray-300"><strong>Security review completed.</strong> Model/tool boundaries, benchmark identity, safety regressions, adapter-integrity state, signer trust, and candidate artifact scope have been reviewed.</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setSelectedId(null)} disabled={busy} className="rounded border border-gray-700 px-3 py-2 text-[10px] font-bold text-gray-400 hover:text-gray-200 disabled:opacity-50">CANCEL</button>
            <button
              onClick={() => void advance()}
              disabled={busy || !reviewer.trim() || !dataGovernanceAttested || !securityAttested || !selected.releaseCandidateEligible}
              className="rounded border border-violet-500/50 bg-violet-950/20 px-3 py-2 text-[10px] font-bold text-violet-200 hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-transparent disabled:text-gray-600"
            >
              {busy ? 'REVALIDATING...' : 'ADVANCE TO RELEASE_CANDIDATE'}
            </button>
          </div>
        </div>
      )}

      {message && <div className="rounded border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-[10px] text-cyan-200">{message}</div>}
    </div>
  );
};
