import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, FileInput, FolderOpen, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  authorizeDesktopWorkspace,
  getDesktopWorkspaceBridge,
  revokeDesktopWorkspace,
  type DesktopWorkspaceDescriptor,
} from '../../platform/desktop/DesktopWorkspaceGateway';
import {
  getDesktopTrainingBridge,
  getGovernedDesktopTrainingHandoffReceipt,
  listGovernedDesktopTrainingJobs,
  type DesktopTrainingHandoffPackageReceipt,
} from '../../platform/desktop/DesktopTrainingGateway';
import {
  getDesktopTrainingHandoffReadBridge,
  readGovernedDesktopTrainingHandoff,
} from '../../platform/desktop/DesktopTrainingHandoffIngestionGateway';
import { trainingRunHandoffService } from '../../training/TrainingRunHandoffService';
import type { TrainingRunHandoffVerification } from '../../training/TrainingRunHandoff';

export const DesktopTrainingHandoffIngestionPanel: React.FC = () => {
  const [receipt, setReceipt] = useState<DesktopTrainingHandoffPackageReceipt | null>(null);
  const [workspace, setWorkspace] = useState<DesktopWorkspaceDescriptor | null>(null);
  const [verification, setVerification] = useState<TrainingRunHandoffVerification | null>(null);
  const [handoffJson, setHandoffJson] = useState('');
  const [runtimeModel, setRuntimeModel] = useState('');
  const [artifactUri, setArtifactUri] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const desktopAvailable = useMemo(() => Boolean(getDesktopWorkspaceBridge() && getDesktopTrainingBridge() && getDesktopTrainingHandoffReadBridge()), []);

  const discoverReceipt = async () => {
    if (!desktopAvailable) return;
    setBusy('discover');
    setMessage(null);
    setVerification(null);
    setHandoffJson('');
    try {
      const jobs = await listGovernedDesktopTrainingJobs();
      let latest: DesktopTrainingHandoffPackageReceipt | undefined;
      for (const job of jobs) {
        if (job.mode !== 'TRAIN' || job.state !== 'SUCCEEDED') continue;
        const candidate = await getGovernedDesktopTrainingHandoffReceipt(job.id);
        if (candidate) { latest = candidate; break; }
      }
      setReceipt(latest ?? null);
      setMessage(latest
        ? `Found TP-0.63 receipt for ${latest.trainingJobId}. Re-authorize the same workspace root, then load the fixed handoff path.`
        : 'No TP-0.63 packaged handoff receipt is available in this desktop session.');
    } catch (error) {
      setReceipt(null);
      setMessage(error instanceof Error ? error.message : 'Could not discover TP-0.63 handoff receipt');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => { void discoverReceipt(); }, [desktopAvailable]);

  const authorizeWorkspace = async () => {
    setBusy('workspace');
    setMessage(null);
    try {
      if (workspace) {
        try { await revokeDesktopWorkspace(workspace.id); } catch { /* Fresh picker still creates a new bounded authority. */ }
      }
      const next = await authorizeDesktopWorkspace();
      setWorkspace(next);
      if (next) setMessage(`Workspace '${next.name}' authorized for fixed TP-0.64 handoff ingestion.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Workspace authorization failed');
    } finally {
      setBusy(null);
    }
  };

  const loadAndVerify = async () => {
    if (!receipt || !workspace) return;
    setBusy('verify');
    setMessage(null);
    setVerification(null);
    setHandoffJson('');
    try {
      const taskId = `training_handoff_ingest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const read = await readGovernedDesktopTrainingHandoff(receipt, workspace.id, taskId);
      const next = await trainingRunHandoffService.verify(read.handoffJson);
      if (!next.valid || next.handoffSha256 !== receipt.handoffSha256 || !next.result) {
        setVerification(next);
        throw new Error(`TP-0.58 verification rejected the fixed desktop handoff: ${next.errors.join('; ') || 'handoff identity mismatch'}`);
      }
      setHandoffJson(read.handoffJson);
      setVerification(next);
      setRuntimeModel(next.result.targetModel);
      setDisplayName(next.result.targetModel);
      setArtifactUri(`local-model://${next.result.targetModel}`);
      setMessage('Desktop handoff verified against the TP-0.63 receipt and TP-0.58 verifier. Candidate registration remains explicit.');
    } catch (error) {
      setHandoffJson('');
      setMessage(error instanceof Error ? error.message : 'Governed desktop handoff ingestion failed');
    } finally {
      setBusy(null);
    }
  };

  const register = async () => {
    if (!verification?.valid || !handoffJson) return;
    setBusy('register');
    setMessage(null);
    try {
      const registered = await trainingRunHandoffService.register({
        handoffJson,
        runtimeModel,
        artifactUri,
        displayName,
      });
      setMessage(`Registered ${registered.candidate.id} as EXPERIMENTAL. No benchmark, promotion, activation, publication, or deployment occurred.`);
      setHandoffJson('');
      setVerification(null);
      if (workspace) {
        try { await revokeDesktopWorkspace(workspace.id); } catch { /* Manual revoke remains available after registration. */ }
        setWorkspace(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Candidate registration from desktop handoff failed');
    } finally {
      setBusy(null);
    }
  };

  if (!desktopAvailable) {
    return null;
  }

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-gray-300"><FileInput size={14} className="text-violet-400" /> TP-0.64 DESKTOP HANDOFF INGESTION</div>
        <button onClick={() => void discoverReceipt()} disabled={busy !== null} className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[9px] text-gray-400 hover:border-violet-500/40 hover:text-violet-300 disabled:opacity-50"><RefreshCw size={10} /> DISCOVER</button>
      </div>

      <div className="rounded border border-violet-500/20 bg-violet-950/10 p-3 text-[10px] leading-relaxed text-gray-400">
        <div className="mb-1 flex items-center gap-1.5 font-bold text-violet-300"><ShieldCheck size={11} /> FIXED RECEIPT PATH — NO FILE PICKER</div>
        Mio reads only the handoff path recorded by TP-0.63 after you explicitly authorize the workspace root again. The full handoff is held transiently only long enough for the existing TP-0.58 verifier and explicit registration; no generic workspace path is accepted here.
      </div>

      {receipt ? (
        <div className="rounded border border-gray-800 bg-[#080b12] p-3 grid gap-1 text-[10px] text-gray-400 md:grid-cols-2">
          <span>Job: <code className="text-gray-200">{receipt.trainingJobId}</code></span>
          <span>Bundle: <code className="text-gray-200">{receipt.bundleId}</code></span>
          <span className="md:col-span-2">Handoff: <code className="text-violet-300">{receipt.handoffRelativePath}</code></span>
          <span>Handoff SHA: <code>{receipt.handoffSha256.slice(0, 20)}…</code></span>
          <span>Packaged: <strong>{new Date(receipt.packagedAt).toLocaleString()}</strong></span>
        </div>
      ) : <p className="text-[10px] text-gray-500">No packaged handoff receipt discovered.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => void authorizeWorkspace()} disabled={!receipt || busy !== null} className="flex items-center gap-1.5 rounded border border-cyan-500/40 px-3 py-2 text-[10px] font-bold text-cyan-300 disabled:opacity-40"><FolderOpen size={12} /> AUTHORIZE RECEIPT WORKSPACE</button>
        <button onClick={() => void loadAndVerify()} disabled={!receipt || !workspace || busy !== null} className="rounded border border-violet-500/40 px-3 py-2 text-[10px] font-bold text-violet-300 disabled:border-gray-700 disabled:text-gray-600">{busy === 'verify' ? 'VERIFYING…' : 'LOAD FIXED HANDOFF + VERIFY'}</button>
        <span className="text-[10px] text-gray-500">{workspace ? `${workspace.name} · ${workspace.id}` : 'Workspace not re-authorized'}</span>
      </div>

      {verification?.valid && verification.result && (
        <div className="space-y-3 rounded border border-emerald-500/20 bg-emerald-950/10 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-300"><BadgeCheck size={12} /> TP-0.58 HANDOFF VERIFIED</div>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="space-y-1"><span className="text-[9px] text-gray-500">RUNTIME MODEL ALIAS</span><input value={runtimeModel} onChange={(event) => setRuntimeModel(event.target.value)} className="w-full rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white" /></label>
            <label className="space-y-1"><span className="text-[9px] text-gray-500">ARTIFACT URI</span><input value={artifactUri} onChange={(event) => setArtifactUri(event.target.value)} className="w-full rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white" /></label>
            <label className="space-y-1"><span className="text-[9px] text-gray-500">DISPLAY NAME</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="w-full rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white" /></label>
          </div>
          <p className="text-[9px] text-amber-300">Runtime alias and artifact URI remain operator-confirmed values; handoff verification does not prove adapter bytes. TP-0.50/0.59 integrity remains mandatory.</p>
          <button onClick={() => void register()} disabled={busy !== null || !runtimeModel.trim() || !artifactUri.trim()} className="rounded border border-emerald-500/40 px-3 py-2 text-[10px] font-bold text-emerald-300 disabled:border-gray-700 disabled:text-gray-600">{busy === 'register' ? 'REGISTERING…' : 'REGISTER EXPERIMENTAL CANDIDATE'}</button>
        </div>
      )}

      {message && <div className="rounded border border-cyan-500/30 bg-cyan-950/10 px-3 py-2 text-[10px] text-cyan-200">{message}</div>}
    </div>
  );
};
