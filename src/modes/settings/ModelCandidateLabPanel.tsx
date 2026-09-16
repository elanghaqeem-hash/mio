import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  FileCheck2,
  FlaskConical,
  Gauge,
  Import,
  Play,
  RefreshCw,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import { LocalInferenceBackendId } from '../../types/models';
import {
  CandidateLabComparisonRecord,
  CandidateLabImportPreview,
  CandidateRuntimeReadiness,
  trainingCandidateLabService,
} from '../../training/TrainingCandidateLabService';
import {
  TrainingCandidateReviewSnapshot,
  trainingCandidateReviewService,
} from '../../training/TrainingCandidateReviewService';

const MAX_FILE_BYTES = 64 * 1024 * 1024;

type ImportPart = 'manifest' | 'dataset' | 'result';

interface ImportTexts {
  manifest: string;
  dataset: string;
  result: string;
}

interface ImportNames {
  manifest: string;
  dataset: string;
  result: string;
}

interface ModelCandidateLabPanelProps {
  backend: LocalInferenceBackendId;
  endpoint?: string;
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const signedPct = (value: number): string => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} pp`;
const signedMs = (value: number): string => `${value >= 0 ? '+' : ''}${Math.round(value)} ms`;

export const ModelCandidateLabPanel: React.FC<ModelCandidateLabPanelProps> = ({ backend, endpoint }) => {
  const [texts, setTexts] = useState<ImportTexts>({ manifest: '', dataset: '', result: '' });
  const [names, setNames] = useState<ImportNames>({ manifest: '', dataset: '', result: '' });
  const [preview, setPreview] = useState<CandidateLabImportPreview | null>(null);
  const [runtimeModel, setRuntimeModel] = useState('');
  const [artifactUri, setArtifactUri] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [candidates, setCandidates] = useState<TrainingCandidateReviewSnapshot[]>([]);
  const [readiness, setReadiness] = useState<Record<string, CandidateRuntimeReadiness>>({});
  const [comparisons, setComparisons] = useState<Record<string, CandidateLabComparisonRecord>>({});
  const [baseAliases, setBaseAliases] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const snapshots = await trainingCandidateReviewService.list();
    setCandidates(snapshots);
    const nextComparisons: Record<string, CandidateLabComparisonRecord> = {};
    const nextAliases: Record<string, string> = {};
    for (const snapshot of snapshots) {
      const comparison = await trainingCandidateLabService.latestComparison(snapshot.candidate.id);
      if (comparison) nextComparisons[snapshot.candidate.id] = comparison;
      nextAliases[snapshot.candidate.id] = comparison?.baseRuntimeModel ?? snapshot.manifest.baseModel;
    }
    setComparisons(nextComparisons);
    setBaseAliases((existing) => ({ ...nextAliases, ...existing }));
  }, []);

  useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : 'Candidate Lab could not read registry'));
  }, [refresh]);

  const readImportFile = async (part: ImportPart, file?: File) => {
    if (!file) return;
    setMessage(null);
    setPreview(null);
    if (file.size > MAX_FILE_BYTES) {
      setMessage(`${file.name} exceeds the 64 MiB Candidate Lab import limit.`);
      return;
    }
    try {
      const content = await file.text();
      setTexts((current) => ({ ...current, [part]: content }));
      setNames((current) => ({ ...current, [part]: file.name }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not read ${file.name}`);
    }
  };

  const verifyImport = async () => {
    setBusy('verify');
    setMessage(null);
    try {
      const next = await trainingCandidateLabService.previewImport(texts.manifest, texts.dataset, texts.result);
      setPreview(next);
      if (next.valid && next.result) {
        setRuntimeModel(next.result.targetModel);
        setDisplayName(next.result.targetModel);
        setArtifactUri(`local-model://${next.result.targetModel}`);
        setMessage('Import verified. Dataset/config fingerprints and training-result binding are consistent. Candidate is not registered yet.');
      } else {
        setMessage(`Import verification failed: ${next.errors.join('; ')}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Candidate Lab import verification failed');
    } finally {
      setBusy(null);
    }
  };

  const register = async () => {
    setBusy('register');
    setMessage(null);
    try {
      const result = await trainingCandidateLabService.registerImport({
        manifestJson: texts.manifest,
        trainingJsonl: texts.dataset,
        trainingResultJson: texts.result,
        runtimeModel,
        artifactUri,
        displayName,
      });
      setMessage(`Registered ${result.candidate.id} as EXPERIMENTAL. Benchmark, review, promotion, and activation remain separate gates.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Candidate registration failed');
    } finally {
      setBusy(null);
    }
  };

  const checkReadiness = async (candidateId: string) => {
    setBusy(`ready:${candidateId}`);
    setMessage(null);
    try {
      const next = await trainingCandidateLabService.checkCandidateReadiness(candidateId, backend, endpoint);
      setReadiness((current) => ({ ...current, [candidateId]: next }));
      setMessage(next.ready ? `${next.model} is ready on ${next.backend}.` : `${next.model} is not ready: ${next.detail}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Candidate readiness check failed');
    } finally {
      setBusy(null);
    }
  };

  const runBenchmark = async (candidateId: string) => {
    setBusy(`bench:${candidateId}`);
    setMessage(null);
    try {
      const evaluation = await trainingCandidateLabService.runCandidateBenchmark({
        candidateId,
        backend,
        endpoint,
      });
      setMessage(`MioBench completed for ${evaluation.manifest.runtimeModel}: pass ${pct(evaluation.metrics.passRate)}, score ${pct(evaluation.metrics.scoreRatio)}. Policy ${evaluation.policyPassed ? 'PASS' : 'FAIL'}. No lifecycle change was performed.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Candidate MioBench failed');
    } finally {
      setBusy(null);
    }
  };

  const runComparison = async (candidateId: string) => {
    setBusy(`compare:${candidateId}`);
    setMessage(null);
    try {
      const comparison = await trainingCandidateLabService.runComparison({
        candidateId,
        backend,
        endpoint,
        baseRuntimeModel: baseAliases[candidateId] ?? '',
      });
      setComparisons((current) => ({ ...current, [candidateId]: comparison }));
      setMessage('Base-vs-candidate MioBench comparison recorded. Deltas are bounded benchmark evidence, not a general model ranking or promotion decision.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Base-vs-candidate comparison failed');
    } finally {
      setBusy(null);
    }
  };

  const importComplete = Boolean(texts.manifest && texts.dataset && texts.result);

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-gray-300 font-bold flex items-center gap-2">
          <FlaskConical size={14} className="text-fuchsia-400" /> NATIVE MODEL CANDIDATE LAB
        </span>
        <button onClick={() => void refresh()} disabled={busy !== null} className="flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[10px] text-gray-300 hover:border-fuchsia-500/50 hover:text-fuchsia-300 disabled:opacity-50">
          <RefreshCw size={11} /> REFRESH
        </button>
      </div>

      <p className="text-gray-500 text-[10px] leading-relaxed">
        Import a governed TP-0.46 bundle and its training result, verify cryptographic identity, register an EXPERIMENTAL runtime candidate, test local readiness, run MioBench, and compare base vs candidate. This Lab never promotes or activates a model. Artifact URI is an identity reference; byte-level adapter-file verification is not claimed here.
      </p>
      <div className="rounded border border-gray-800 bg-[#111726] px-3 py-2 text-[9px] text-gray-500">
        Evaluation backend: <strong className="text-gray-300">{backend}</strong> · endpoint: <code className="text-gray-400">{endpoint ?? 'backend default'}</code>. Candidate Lab uses this live Settings configuration without changing the active model router.
      </div>

      <div className="rounded-lg border border-gray-800 bg-[#111726] p-3 space-y-3">
        <div className="font-bold text-gray-200 flex items-center gap-2"><Import size={13} className="text-fuchsia-400" /> IMPORT GOVERNED TRAINING OUTPUT</div>
        <div className="grid gap-2 md:grid-cols-3">
          {([
            ['manifest', 'manifest.json', '.json,application/json'],
            ['dataset', 'train.jsonl', '.jsonl,text/plain'],
            ['result', 'mio-training-result.json', '.json,application/json'],
          ] as const).map(([part, label, accept]) => (
            <label key={part} className="rounded border border-gray-700 bg-[#0a0f18] p-2.5 cursor-pointer hover:border-fuchsia-500/40">
              <span className="block text-[9px] font-bold text-gray-400">{label}</span>
              <span className="mt-1 block truncate text-[10px] text-gray-500">{names[part] || 'Choose file…'}</span>
              <input type="file" accept={accept} className="hidden" onChange={(event) => void readImportFile(part, event.target.files?.[0])} />
            </label>
          ))}
        </div>
        <button
          onClick={() => void verifyImport()}
          disabled={!importComplete || busy !== null}
          className="flex items-center justify-center gap-1.5 rounded border border-fuchsia-500/40 px-3 py-2 text-[10px] font-bold text-fuchsia-300 hover:bg-fuchsia-950/20 disabled:border-gray-700 disabled:text-gray-600"
        >
          <FileCheck2 size={12} /> {busy === 'verify' ? 'VERIFYING…' : 'VERIFY IMPORT'}
        </button>

        {preview && (
          <div className={`rounded border p-2.5 text-[10px] ${preview.valid ? 'border-emerald-500/30 bg-emerald-950/10 text-emerald-300' : 'border-red-500/30 bg-red-950/10 text-red-300'}`}>
            <div className="font-bold flex items-center gap-1.5">{preview.valid ? <BadgeCheck size={12} /> : <ShieldAlert size={12} />} {preview.valid ? 'CRYPTOGRAPHIC IMPORT VERIFIED' : 'IMPORT BLOCKED'}</div>
            {preview.valid && preview.manifest ? (
              <div className="mt-2 grid gap-1 text-gray-400 md:grid-cols-2">
                <span>Bundle: <strong className="text-gray-200">{preview.manifest.bundleId}</strong></span>
                <span>Examples: <strong className="text-gray-200">{preview.manifest.dataset.exampleCount}</strong></span>
                <span>Dataset SHA: <code>{preview.manifest.dataset.sha256.slice(0, 20)}…</code></span>
                <span>Config SHA: <code>{preview.manifest.reproducibility.configSha256.slice(0, 20)}…</code></span>
                <span>Method: <strong>{preview.manifest.config.trainingMethod}</strong></span>
                <span>Target: <strong>{preview.manifest.config.targetModel}</strong></span>
              </div>
            ) : (
              <ul className="mt-2 list-disc pl-4">{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul>
            )}
          </div>
        )}

        {preview?.valid && (
          <div className="grid gap-2 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-[9px] text-gray-500">RUNTIME MODEL ALIAS</span>
              <input value={runtimeModel} onChange={(event) => setRuntimeModel(event.target.value)} className="w-full rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white" />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] text-gray-500">ARTIFACT URI</span>
              <input value={artifactUri} onChange={(event) => setArtifactUri(event.target.value)} className="w-full rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white" />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] text-gray-500">DISPLAY NAME</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="w-full rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white" />
            </label>
            <button
              onClick={() => void register()}
              disabled={busy !== null || !runtimeModel.trim() || !artifactUri.trim()}
              className="md:col-span-3 flex items-center justify-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-950/10 px-3 py-2 text-[10px] font-bold text-emerald-300 hover:bg-emerald-950/20 disabled:border-gray-700 disabled:bg-transparent disabled:text-gray-600"
            >
              <BadgeCheck size={12} /> {busy === 'register' ? 'REGISTERING…' : 'REGISTER AS EXPERIMENTAL CANDIDATE'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="font-bold text-gray-200 flex items-center gap-2"><Gauge size={13} className="text-cyan-400" /> LOCAL CANDIDATE EVALUATION</div>
        {candidates.length === 0 ? (
          <div className="rounded border border-gray-800 bg-[#111726] p-3 text-[10px] text-gray-500">No registered candidates yet.</div>
        ) : candidates.map((snapshot) => {
          const candidateId = snapshot.candidate.id;
          const ready = readiness[candidateId];
          const comparison = comparisons[candidateId];
          const busyForCandidate = busy?.endsWith(candidateId) === true;
          return (
            <div key={candidateId} className="rounded-lg border border-gray-800 bg-[#111726] p-3 space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="font-bold text-gray-200 truncate">{snapshot.manifest.displayName}</div>
                  <div className="mt-1 text-[10px] text-gray-500 truncate">{snapshot.manifest.runtimeModel} · {snapshot.manifest.trainingMethod} · {snapshot.manifest.lifecycle}</div>
                  <div className="mt-1 text-[9px] text-gray-600">Artifact identity: {snapshot.candidate.artifactUri}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => void checkReadiness(candidateId)} disabled={busy !== null} className="rounded border border-gray-700 px-2.5 py-1.5 text-[9px] font-bold text-gray-300 hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"><Activity size={10} className="inline mr-1" />READINESS</button>
                  <button onClick={() => void runBenchmark(candidateId)} disabled={busy !== null} className="rounded border border-cyan-500/40 px-2.5 py-1.5 text-[9px] font-bold text-cyan-300 hover:bg-cyan-950/20 disabled:opacity-50"><Play size={10} className="inline mr-1" />MIOBENCH</button>
                </div>
              </div>

              {ready && (
                <div className={`rounded border px-2.5 py-2 text-[9px] ${ready.ready ? 'border-emerald-500/30 bg-emerald-950/10 text-emerald-300' : 'border-red-500/30 bg-red-950/10 text-red-300'}`}>
                  {ready.ready ? 'READY' : 'NOT READY'} — {ready.detail}
                </div>
              )}

              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                  value={baseAliases[candidateId] ?? snapshot.manifest.baseModel}
                  onChange={(event) => setBaseAliases((current) => ({ ...current, [candidateId]: event.target.value }))}
                  placeholder="Base runtime model alias served by the same local backend"
                  className="rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white"
                />
                <button onClick={() => void runComparison(candidateId)} disabled={busy !== null || !(baseAliases[candidateId] ?? snapshot.manifest.baseModel).trim()} className="rounded border border-violet-500/40 px-3 py-2 text-[9px] font-bold text-violet-300 hover:bg-violet-950/20 disabled:opacity-50">
                  <Scale size={10} className="inline mr-1" />{busyForCandidate && busy?.startsWith('compare:') ? 'COMPARING…' : 'COMPARE BASE VS CANDIDATE'}
                </button>
              </div>

              {snapshot.latestBenchmark && (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-[9px]">
                  <div className="rounded border border-gray-800 bg-[#0a0f18] p-2"><span className="block text-gray-600">CANDIDATE PASS</span><strong className="text-cyan-300">{pct(snapshot.latestBenchmark.report.passRate)}</strong></div>
                  <div className="rounded border border-gray-800 bg-[#0a0f18] p-2"><span className="block text-gray-600">CANDIDATE SCORE</span><strong className="text-cyan-300">{pct(snapshot.latestBenchmark.report.maxScore > 0 ? snapshot.latestBenchmark.report.score / snapshot.latestBenchmark.report.maxScore : 0)}</strong></div>
                  <div className="rounded border border-gray-800 bg-[#0a0f18] p-2"><span className="block text-gray-600">POLICY STATUS</span><strong className={snapshot.candidate.status === 'BENCHMARKED_POLICY_PASS' ? 'text-emerald-300' : 'text-amber-300'}>{snapshot.candidate.status}</strong></div>
                  <div className="rounded border border-gray-800 bg-[#0a0f18] p-2"><span className="block text-gray-600">RC READINESS</span><strong className={snapshot.releaseCandidateEligible ? 'text-emerald-300' : 'text-gray-400'}>{snapshot.releaseCandidateEligible ? 'READY FOR REVIEW' : 'BLOCKED'}</strong></div>
                </div>
              )}

              {comparison && (
                <div className="rounded border border-violet-500/20 bg-violet-950/10 p-2.5 space-y-2 text-[9px]">
                  <div className="font-bold text-violet-300">LATEST BOUNDED COMPARISON</div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div><span className="block text-gray-600">BASE PASS</span><strong className="text-gray-300">{pct(comparison.baseMetrics.passRate)}</strong></div>
                    <div><span className="block text-gray-600">CANDIDATE PASS</span><strong className="text-gray-300">{pct(comparison.candidateMetrics.passRate)}</strong></div>
                    <div><span className="block text-gray-600">PASS Δ</span><strong className="text-violet-300">{signedPct(comparison.delta.passRate)}</strong></div>
                    <div><span className="block text-gray-600">LATENCY Δ</span><strong className="text-violet-300">{signedMs(comparison.delta.averageLatencyMs)}</strong></div>
                  </div>
                  <p className="text-gray-600">{comparison.disclosure}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded border border-amber-500/20 bg-amber-950/10 p-2.5 text-[9px] text-amber-300">
        <strong>Artifact-integrity boundary:</strong> this Lab validates bundle/result cryptographic identity and verifies that a configured local runtime serves the expected model alias. It does not hash the current adapter files on disk. Byte-level local artifact verification requires a separate desktop-scoped hashing capability.
      </div>

      {message && <div className="rounded border border-fuchsia-500/30 bg-fuchsia-950/10 px-3 py-2 text-[10px] text-fuchsia-200">{message}</div>}
    </div>
  );
};
