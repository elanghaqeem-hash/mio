import React, { useState } from 'react';
import { BadgeCheck, FileCheck2, Import, ShieldAlert } from 'lucide-react';
import { trainingRunHandoffService } from '../../training/TrainingRunHandoffService';
import type { TrainingRunHandoffVerification } from '../../training/TrainingRunHandoff';
import { DesktopTrainingHandoffIngestionPanel } from './DesktopTrainingHandoffIngestionPanel';

const MAX_FILE_BYTES = 64 * 1024 * 1024;

interface TrainingRunHandoffPanelProps {
  onRegistered?: () => void | Promise<void>;
}

export const TrainingRunHandoffPanel: React.FC<TrainingRunHandoffPanelProps> = ({ onRegistered }) => {
  const [handoffJson, setHandoffJson] = useState('');
  const [fileName, setFileName] = useState('');
  const [verification, setVerification] = useState<TrainingRunHandoffVerification | null>(null);
  const [runtimeModel, setRuntimeModel] = useState('');
  const [artifactUri, setArtifactUri] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const readFile = async (file?: File) => {
    if (!file) return;
    setMessage(null);
    setVerification(null);
    if (file.size > MAX_FILE_BYTES) {
      setMessage(`${file.name} exceeds the 64 MiB training handoff import limit.`);
      return;
    }
    try {
      setHandoffJson(await file.text());
      setFileName(file.name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not read ${file.name}`);
    }
  };

  const verify = async () => {
    setBusy('verify');
    setMessage(null);
    try {
      const next = await trainingRunHandoffService.verify(handoffJson);
      setVerification(next);
      if (next.valid && next.result) {
        setRuntimeModel(next.result.targetModel);
        setDisplayName(next.result.targetModel);
        setArtifactUri(`local-model://${next.result.targetModel}`);
        setMessage('Training run handoff verified. Registration remains explicit and does not benchmark, promote, or activate the model.');
      } else {
        setMessage(`Training run handoff verification failed: ${next.errors.join('; ')}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Training run handoff verification failed');
    } finally {
      setBusy(null);
    }
  };

  const register = async () => {
    setBusy('register');
    setMessage(null);
    try {
      const result = await trainingRunHandoffService.register({
        handoffJson,
        runtimeModel,
        artifactUri,
        displayName,
      });
      setMessage(`Registered ${result.candidate.id} as EXPERIMENTAL from the verified handoff. Adapter byte integrity, MioBench, review, promotion, and activation remain separate gates.`);
      await onRegistered?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Training run handoff registration failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <DesktopTrainingHandoffIngestionPanel />
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
        <div className="flex items-center gap-2 text-gray-300 font-bold">
          <Import size={14} className="text-cyan-400" /> GOVERNED TRAINING RUN HANDOFF — MANUAL FALLBACK
        </div>
        <p className="text-[10px] leading-relaxed text-gray-500">
          Manual fallback for importing one <code>mio-training-handoff.json</code>. Mio verifies bundle, result binding, and handoff fingerprints before registration. Desktop users with a TP-0.63 receipt should prefer the fixed-path TP-0.64 ingestion panel above. The handoff never proves adapter bytes and never promotes or activates a model.
        </p>

        <label className="block rounded border border-gray-700 bg-[#111726] p-3 cursor-pointer hover:border-cyan-500/40">
          <span className="block text-[9px] font-bold text-gray-400">MIO TRAINING RUN HANDOFF</span>
          <span className="mt-1 block truncate text-[10px] text-gray-500">{fileName || 'Choose mio-training-handoff.json…'}</span>
          <input type="file" accept=".json,application/json" className="hidden" onChange={(event) => void readFile(event.target.files?.[0])} />
        </label>

        <button onClick={() => void verify()} disabled={!handoffJson || busy !== null} className="flex items-center justify-center gap-1.5 rounded border border-cyan-500/40 px-3 py-2 text-[10px] font-bold text-cyan-300 hover:bg-cyan-950/20 disabled:border-gray-700 disabled:text-gray-600">
          <FileCheck2 size={12} /> {busy === 'verify' ? 'VERIFYING…' : 'VERIFY HANDOFF'}
        </button>

        {verification && (
          <div className={`rounded border p-2.5 text-[10px] ${verification.valid ? 'border-emerald-500/30 bg-emerald-950/10 text-emerald-300' : 'border-red-500/30 bg-red-950/10 text-red-300'}`}>
            <div className="font-bold flex items-center gap-1.5">{verification.valid ? <BadgeCheck size={12} /> : <ShieldAlert size={12} />} {verification.valid ? 'HANDOFF VERIFIED' : 'HANDOFF BLOCKED'}</div>
            {verification.valid && verification.bundle && verification.result ? (
              <div className="mt-2 grid gap-1 text-gray-400 md:grid-cols-2">
                <span>Bundle: <strong className="text-gray-200">{verification.bundle.manifest.bundleId}</strong></span>
                <span>Examples: <strong className="text-gray-200">{verification.bundle.manifest.dataset.exampleCount}</strong></span>
                <span>Result SHA: <code>{verification.trainingResultSha256?.slice(0, 20)}…</code></span>
                <span>Handoff SHA: <code>{verification.handoffSha256?.slice(0, 20)}…</code></span>
                <span>Method: <strong>{verification.result.trainingMethod}</strong></span>
                <span>Status: <strong>{verification.result.status}</strong></span>
              </div>
            ) : (
              <ul className="mt-2 list-disc pl-4">{verification.errors.map((error) => <li key={error}>{error}</li>)}</ul>
            )}
          </div>
        )}

        {verification?.valid && (
          <div className="space-y-3 rounded border border-gray-800 bg-[#111726] p-3">
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
            </div>
            <div className="text-[9px] text-amber-300">Runtime alias and artifact URI are intentionally not trusted from the handoff. Confirm them against the local runtime/output location. TP-0.50 adapter integrity scanning is still required before promotion.</div>
            <button onClick={() => void register()} disabled={busy !== null || !runtimeModel.trim() || !artifactUri.trim()} className="rounded border border-emerald-500/40 px-3 py-2 text-[10px] font-bold text-emerald-300 hover:bg-emerald-950/20 disabled:border-gray-700 disabled:text-gray-600">
              {busy === 'register' ? 'REGISTERING…' : 'REGISTER EXPERIMENTAL CANDIDATE'}
            </button>
          </div>
        )}

        {message && <div className="rounded border border-cyan-500/30 bg-cyan-950/10 px-3 py-2 text-[10px] text-cyan-200">{message}</div>}
      </div>
    </>
  );
};
