import React, { useEffect, useMemo, useState } from 'react';
import { Cpu, FileArchive, FolderOpen, Play, RefreshCw, ShieldCheck, Square } from 'lucide-react';
import {
  authorizeDesktopWorkspace,
  getDesktopWorkspaceBridge,
  revokeDesktopWorkspace,
  type DesktopWorkspaceDescriptor,
} from '../../platform/desktop/DesktopWorkspaceGateway';
import {
  cancelGovernedDesktopTrainingJob,
  getDesktopTrainingBridge,
  getGovernedDesktopTrainingHandoffReceipt,
  getGovernedDesktopTrainingJob,
  listGovernedDesktopTrainingJobs,
  packageGovernedDesktopTrainingHandoff,
  startGovernedDesktopTraining,
  type DesktopTrainingHandoffPackageReceipt,
  type DesktopTrainingJobMode,
  type DesktopTrainingJobSnapshot,
  type DesktopTrainingPythonRuntime,
} from '../../platform/desktop/DesktopTrainingGateway';

function terminal(state?: DesktopTrainingJobSnapshot['state']): boolean {
  return state === 'SUCCEEDED' || state === 'FAILED' || state === 'CANCELLED';
}

export const GovernedTrainingRunnerPanel: React.FC = () => {
  const [workspace, setWorkspace] = useState<DesktopWorkspaceDescriptor | null>(null);
  const [bundlePath, setBundlePath] = useState('bundle');
  const [outputPath, setOutputPath] = useState('adapter-output');
  const [runtime, setRuntime] = useState<DesktopTrainingPythonRuntime>('python');
  const [mode, setMode] = useState<DesktopTrainingJobMode>('DRY_RUN');
  const [job, setJob] = useState<DesktopTrainingJobSnapshot | null>(null);
  const [receipt, setReceipt] = useState<DesktopTrainingHandoffPackageReceipt | null>(null);
  const [history, setHistory] = useState<DesktopTrainingJobSnapshot[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const desktopAvailable = useMemo(() => Boolean(getDesktopWorkspaceBridge() && getDesktopTrainingBridge()), []);

  const refreshReceipt = async (candidate: DesktopTrainingJobSnapshot | null) => {
    if (!candidate || candidate.mode !== 'TRAIN' || candidate.state !== 'SUCCEEDED') {
      setReceipt(null);
      return;
    }
    try { setReceipt(await getGovernedDesktopTrainingHandoffReceipt(candidate.id) ?? null); }
    catch { setReceipt(null); }
  };

  const refreshHistory = async () => {
    if (!desktopAvailable) return;
    try {
      const jobs = await listGovernedDesktopTrainingJobs();
      setHistory(jobs);
      const candidate = jobs.find((item) => item.state === 'RUNNING')
        ?? jobs.find((item) => item.state === 'SUCCEEDED' && item.mode === 'TRAIN')
        ?? jobs[0];
      if (candidate) {
        setJob(candidate);
        setWorkspace((current) => current ?? { id: candidate.workspaceId, name: 'Recovered training workspace' });
        await refreshReceipt(candidate);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Training job history could not be read');
    }
  };

  useEffect(() => { void refreshHistory(); }, [desktopAvailable]);

  useEffect(() => {
    if (!desktopAvailable || !job || job.state !== 'RUNNING') return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const next = await getGovernedDesktopTrainingJob(job.id);
          setJob(next);
          if (terminal(next.state)) {
            setHistory(await listGovernedDesktopTrainingJobs());
            if (next.state === 'SUCCEEDED' && next.mode === 'TRAIN') {
              setMessage('Training succeeded as TRAINED_NOT_EVALUATED. Workspace authority is retained temporarily so TP-0.63 can package the exact TP-0.58 handoff.');
              await refreshReceipt(next);
            } else if (workspace?.id === next.workspaceId) {
              try {
                await revokeDesktopWorkspace(workspace.id);
                setWorkspace(null);
              } catch {
                // Manual revoke remains available if best-effort terminal cleanup fails.
              }
            }
          }
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Training job polling failed');
        }
      })();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [desktopAvailable, job?.id, job?.state, workspace?.id]);

  const authorizeWorkspace = async () => {
    if (!desktopAvailable) return;
    setBusy('workspace');
    setMessage(null);
    try {
      if (workspace && job?.state !== 'RUNNING') {
        try { await revokeDesktopWorkspace(workspace.id); } catch { /* New picker still requires explicit fresh authority. */ }
      }
      const next = await authorizeDesktopWorkspace();
      if (next) {
        setWorkspace(next);
        setJob(null);
        setReceipt(null);
        setMessage(`Workspace '${next.name}' authorized for this governed training flow. Only relative bundle/output paths are accepted.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Workspace authorization failed');
    } finally {
      setBusy(null);
    }
  };

  const releaseWorkspace = async () => {
    if (!workspace) return;
    setBusy('workspace');
    setMessage(null);
    try {
      const revoked = await revokeDesktopWorkspace(workspace.id);
      if (revoked) {
        setWorkspace(null);
        setMessage('Workspace authority revoked.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Workspace revocation failed');
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    if (!workspace) return;
    setBusy('start');
    setMessage(null);
    setReceipt(null);
    try {
      const input = {
        workspaceId: workspace.id,
        bundleRelativePath: bundlePath.trim(),
        ...(mode === 'TRAIN' ? { outputRelativePath: outputPath.trim() } : {}),
        pythonRuntime: runtime,
        mode,
      } as const;
      const taskId = `training_start_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const started = await startGovernedDesktopTraining(input, taskId);
      setJob(started);
      setHistory(await listGovernedDesktopTrainingJobs());
      setMessage(mode === 'DRY_RUN'
        ? 'Governed dry-run started. It verifies the TP-0.46 bundle without loading ML dependencies or model weights.'
        : 'Governed local training started. The pre-run bundle identity is frozen for TP-0.63 handoff binding. Completion remains TRAINED_NOT_EVALUATED.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Governed local training start failed');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!job || job.state !== 'RUNNING') return;
    setBusy('cancel');
    setMessage(null);
    try {
      setJob(await cancelGovernedDesktopTrainingJob(job.id));
      setMessage('Cancellation requested. Mio sends SIGTERM first and escalates if the fixed runner does not exit.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Training cancellation failed');
    } finally {
      setBusy(null);
    }
  };

  const packageHandoff = async () => {
    if (!job || job.mode !== 'TRAIN' || job.state !== 'SUCCEEDED') return;
    setBusy('handoff');
    setMessage(null);
    try {
      const taskId = `training_handoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const packaged = await packageGovernedDesktopTrainingHandoff(job, taskId);
      setReceipt(packaged);
      setMessage(`TP-0.58 handoff created at ${packaged.handoffRelativePath}. SHA-256 ${packaged.handoffSha256}. No candidate registration or lifecycle change occurred.`);
      if (workspace?.id === job.workspaceId) {
        try {
          await revokeDesktopWorkspace(workspace.id);
          setWorkspace(null);
        } catch {
          // Packaging is complete; the operator can retry manual revoke if cleanup fails.
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Governed TP-0.58 handoff packaging failed');
    } finally {
      setBusy(null);
    }
  };

  if (!desktopAvailable) {
    return (
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-2">
        <div className="flex items-center gap-2 font-bold text-gray-300"><Cpu size={14} className="text-cyan-400" /> GOVERNED LOCAL TRAINING RUNNER</div>
        <p className="text-[10px] text-gray-500">Desktop/Electron only. Browser deployments cannot spawn Python, access a local training workspace, or package local TP-0.58 handoff files.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-gray-300"><Cpu size={14} className="text-cyan-400" /> GOVERNED LOCAL TRAINING RUNNER</div>
        <button onClick={() => void refreshHistory()} disabled={busy !== null} className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[9px] text-gray-400 hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"><RefreshCw size={10} /> REFRESH</button>
      </div>

      <div className="rounded border border-cyan-500/20 bg-cyan-950/10 p-3 text-[10px] leading-relaxed text-gray-400">
        <div className="mb-1 flex items-center gap-1.5 font-bold text-cyan-300"><ShieldCheck size={11} /> FIXED ENTRYPOINT + L4 EXECUTION</div>
        Mio can only start the bundled <code>training/train_mio_lora.py</code> runner with a whitelisted Python launcher. After a successful TRAIN, TP-0.63 can invoke only the bundled TP-0.58 packager and write the fixed <code>mio-training-handoff.json</code> beside the result. Neither path exposes a shell or arbitrary executable. Network minimization remains application-level, not an OS firewall.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => void authorizeWorkspace()} disabled={busy !== null || job?.state === 'RUNNING'} className="flex items-center gap-1.5 rounded border border-cyan-500/40 px-3 py-2 text-[10px] font-bold text-cyan-300 disabled:opacity-40"><FolderOpen size={12} /> AUTHORIZE WORKSPACE</button>
        {workspace && <button onClick={() => void releaseWorkspace()} disabled={busy !== null} className="rounded border border-gray-700 px-3 py-2 text-[10px] text-gray-400 disabled:opacity-40">REVOKE</button>}
        <span className="text-[10px] text-gray-500">{workspace ? `${workspace.name} · ${workspace.id}` : 'No desktop workspace authority'}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1"><span className="text-[9px] text-gray-500">BUNDLE RELATIVE PATH</span><input value={bundlePath} onChange={(event) => setBundlePath(event.target.value)} disabled={job?.state === 'RUNNING'} className="w-full rounded border border-gray-700 bg-[#111726] px-2.5 py-2 text-xs text-white disabled:opacity-50" /></label>
        <label className="space-y-1"><span className="text-[9px] text-gray-500">OUTPUT RELATIVE PATH {mode === 'DRY_RUN' ? '(unused)' : '(must already exist and be empty)'}</span><input value={outputPath} onChange={(event) => setOutputPath(event.target.value)} disabled={mode === 'DRY_RUN' || job?.state === 'RUNNING'} className="w-full rounded border border-gray-700 bg-[#111726] px-2.5 py-2 text-xs text-white disabled:opacity-40" /></label>
        <label className="space-y-1"><span className="text-[9px] text-gray-500">RUN MODE</span><select value={mode} onChange={(event) => setMode(event.target.value as DesktopTrainingJobMode)} disabled={job?.state === 'RUNNING'} className="w-full rounded border border-gray-700 bg-[#111726] px-2.5 py-2 text-xs text-white"><option value="DRY_RUN">DRY_RUN — verify only</option><option value="TRAIN">TRAIN — LoRA/QLoRA</option></select></label>
        <label className="space-y-1"><span className="text-[9px] text-gray-500">PYTHON LAUNCHER</span><select value={runtime} onChange={(event) => setRuntime(event.target.value as DesktopTrainingPythonRuntime)} disabled={job?.state === 'RUNNING'} className="w-full rounded border border-gray-700 bg-[#111726] px-2.5 py-2 text-xs text-white"><option value="python">python</option><option value="python3">python3</option><option value="py">py -3 (Windows)</option></select></label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => void start()} disabled={!workspace || busy !== null || job?.state === 'RUNNING' || !bundlePath.trim() || (mode === 'TRAIN' && !outputPath.trim())} className="flex items-center gap-1.5 rounded border border-emerald-500/40 px-3 py-2 text-[10px] font-bold text-emerald-300 disabled:border-gray-700 disabled:text-gray-600"><Play size={12} /> {busy === 'start' ? 'REQUESTING…' : mode === 'DRY_RUN' ? 'START L4 DRY-RUN' : 'START L4 TRAINING'}</button>
        <button onClick={() => void cancel()} disabled={job?.state !== 'RUNNING' || busy !== null} className="flex items-center gap-1.5 rounded border border-red-500/40 px-3 py-2 text-[10px] font-bold text-red-300 disabled:border-gray-700 disabled:text-gray-600"><Square size={11} /> CANCEL</button>
        <button onClick={() => void packageHandoff()} disabled={!job || job.mode !== 'TRAIN' || job.state !== 'SUCCEEDED' || busy !== null || receipt !== null} className="flex items-center gap-1.5 rounded border border-violet-500/40 px-3 py-2 text-[10px] font-bold text-violet-300 disabled:border-gray-700 disabled:text-gray-600"><FileArchive size={12} /> {busy === 'handoff' ? 'PACKAGING…' : receipt ? 'HANDOFF PACKAGED' : 'PACKAGE L4 TP-0.58 HANDOFF'}</button>
      </div>

      {job && (
        <div className="rounded border border-gray-800 bg-[#080b12] p-3 space-y-2">
          <div className="grid gap-1 text-[10px] text-gray-400 md:grid-cols-2">
            <span>Job: <code className="text-gray-200">{job.id}</code></span><span>State: <strong className={job.state === 'SUCCEEDED' ? 'text-emerald-300' : job.state === 'FAILED' || job.state === 'CANCELLED' ? 'text-amber-300' : 'text-cyan-300'}>{job.state}</strong></span>
            <span>Mode: <strong className="text-gray-200">{job.mode}</strong></span><span>Started: <strong className="text-gray-200">{new Date(job.startedAt).toLocaleString()}</strong></span>
            <span>Bundle: <code className="text-gray-200">{job.trainingIdentity.bundleId}</code></span><span>Dataset SHA: <code className="text-gray-200">{job.trainingIdentity.datasetSha256.slice(0, 16)}…</code></span>
            {job.resultFileRelativePath && <span className="md:col-span-2">Training result: <code className="text-cyan-300">{job.resultFileRelativePath}</code></span>}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div><div className="mb-1 text-[9px] font-bold text-gray-500">STDOUT TAIL</div><pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded border border-gray-800 bg-black/30 p-2 text-[9px] text-gray-300">{job.stdoutTail || '(no output yet)'}</pre></div>
            <div><div className="mb-1 text-[9px] font-bold text-gray-500">STDERR TAIL</div><pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded border border-gray-800 bg-black/30 p-2 text-[9px] text-gray-400">{job.stderrTail || '(no errors)'}</pre></div>
          </div>
          {job.state === 'SUCCEEDED' && job.mode === 'TRAIN' && !receipt && <p className="text-[10px] text-emerald-300">Training is still TRAINED_NOT_EVALUATED. Package the exact job-bound TP-0.58 handoff before Candidate Lab registration.</p>}
        </div>
      )}

      {receipt && (
        <div className="rounded border border-violet-500/30 bg-violet-950/10 p-3 text-[10px] text-gray-400">
          <div className="font-bold text-violet-300">TP-0.63 HANDOFF RECEIPT</div>
          <div className="mt-2 grid gap-1 md:grid-cols-2">
            <span>Handoff: <code>{receipt.handoffRelativePath}</code></span><span>Bundle: <code>{receipt.bundleId}</code></span>
            <span className="md:col-span-2">Handoff SHA-256: <code>{receipt.handoffSha256}</code></span>
          </div>
          <p className="mt-2 text-gray-500">Only the receipt is returned to the renderer; the handoff's training JSONL remains in the local workspace. Import the generated handoff through the existing Governed Training Run Handoff panel to register the candidate explicitly.</p>
        </div>
      )}

      {history.length > 0 && <div className="text-[9px] text-gray-600">Recent jobs: {history.slice(0, 5).map((item) => `${item.state}:${item.mode}`).join(' · ')}</div>}
      {message && <div className="rounded border border-cyan-500/30 bg-cyan-950/10 px-3 py-2 text-[10px] text-cyan-200">{message}</div>}
    </div>
  );
};
