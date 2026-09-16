import React, { useEffect, useState } from 'react';
import { Archive, Download, FileCheck2, RefreshCw, ShieldAlert } from 'lucide-react';
import { TrainingCandidateRegistry, type TrainingCandidateRecord } from '../../training/TrainingCandidateRegistry';
import {
  trainingCandidateEvidencePackageService,
  verifyCandidateEvidencePackage,
  type CandidateEvidencePackageVerification,
} from '../../training/TrainingCandidateEvidencePackage';

const MAX_FILE_BYTES = 16 * 1024 * 1024;
const candidateRegistry = new TrainingCandidateRegistry();

function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const TrainingCandidateEvidencePackagePanel: React.FC = () => {
  const [candidates, setCandidates] = useState<TrainingCandidateRecord[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verification, setVerification] = useState<CandidateEvidencePackageVerification | null>(null);
  const [verificationFile, setVerificationFile] = useState('');

  const refresh = async () => {
    const next = await candidateRegistry.list(200);
    setCandidates(next);
    setCandidateId((current) => current && next.some((item: TrainingCandidateRecord) => item.id === current) ? current : next[0]?.id ?? '');
  };

  useEffect(() => { void refresh(); }, []);

  const exportPackage = async () => {
    if (!candidateId) return;
    setBusy('export');
    setMessage(null);
    setVerification(null);
    try {
      const pkg = await trainingCandidateEvidencePackageService.export(candidateId);
      const verified = await verifyCandidateEvidencePackage(JSON.stringify(pkg));
      if (!verified.valid) throw new Error(`Self-verification failed: ${verified.errors.join('; ')}`);
      const safeId = candidateId.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 120);
      downloadJson(`mio-candidate-evidence-${safeId}.json`, pkg);
      setVerification(verified);
      setVerificationFile('fresh export');
      setMessage(`Candidate evidence exported with SHA-256 ${pkg.packageSha256}. Export does not promote, activate, deploy, or include training messages/model bytes.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Candidate evidence export failed');
    } finally {
      setBusy(null);
    }
  };

  const verifyFile = async (file?: File) => {
    if (!file) return;
    setBusy('verify');
    setMessage(null);
    setVerification(null);
    setVerificationFile(file.name);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the 16 MiB candidate-evidence verification limit`);
      const result = await verifyCandidateEvidencePackage(await file.text());
      setVerification(result);
      setMessage(result.valid
        ? 'Portable candidate evidence package is internally consistent. This is an audit consistency result, not a promotion or activation decision.'
        : `Candidate evidence package blocked: ${result.errors.join('; ')}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Candidate evidence verification failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-gray-300 font-bold"><Archive size={14} className="text-cyan-400" /> PORTABLE CANDIDATE EVIDENCE PACKAGE</div>
        <button onClick={() => void refresh()} disabled={busy !== null} className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[9px] text-gray-400 hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"><RefreshCw size={10} /> REFRESH</button>
      </div>
      <p className="text-[10px] leading-relaxed text-gray-500">
        Export bounded governance evidence for audit/review. The package omits training JSONL/message content, raw benchmark output, model weights, adapter bytes, private keys, credentials, permission grants, and tool secrets. Package validity never promotes or activates a model.
      </p>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <select value={candidateId} onChange={(event) => setCandidateId(event.target.value)} className="w-full rounded border border-gray-700 bg-[#111726] px-2.5 py-2 text-xs text-white">
          {candidates.length === 0 && <option value="">No registered training candidate</option>}
          {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.id} — {candidate.status}</option>)}
        </select>
        <button onClick={() => void exportPackage()} disabled={!candidateId || busy !== null} className="flex items-center justify-center gap-1.5 rounded border border-cyan-500/40 px-3 py-2 text-[10px] font-bold text-cyan-300 hover:bg-cyan-950/20 disabled:border-gray-700 disabled:text-gray-600">
          <Download size={12} /> {busy === 'export' ? 'EXPORTING…' : 'EXPORT EVIDENCE'}
        </button>
      </div>

      <label className="block cursor-pointer rounded border border-gray-700 bg-[#111726] p-3 hover:border-cyan-500/40">
        <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400"><FileCheck2 size={11} /> VERIFY PORTABLE PACKAGE</span>
        <span className="mt-1 block truncate text-[10px] text-gray-500">{verificationFile || 'Choose mio-candidate-evidence-*.json…'}</span>
        <input type="file" accept=".json,application/json" className="hidden" disabled={busy !== null} onChange={(event) => void verifyFile(event.target.files?.[0])} />
      </label>

      {verification && (
        <div className={`rounded border p-3 text-[10px] ${verification.valid ? 'border-emerald-500/30 bg-emerald-950/10 text-emerald-300' : 'border-red-500/30 bg-red-950/10 text-red-300'}`}>
          <div className="flex items-center gap-1.5 font-bold">{verification.valid ? <FileCheck2 size={12} /> : <ShieldAlert size={12} />} {verification.valid ? 'PACKAGE VERIFIED' : 'PACKAGE BLOCKED'}</div>
          {verification.valid ? (
            <div className="mt-2 grid gap-1 text-gray-400 md:grid-cols-2">
              <span>Candidate: <strong className="text-gray-200">{verification.candidateId}</strong></span>
              <span>Lifecycle snapshot: <strong className="text-gray-200">{verification.lifecycle}</strong></span>
              <span className="md:col-span-2">Package SHA: <code>{verification.packageSha256}</code></span>
            </div>
          ) : (
            <ul className="mt-2 list-disc pl-4">{verification.errors.map((error) => <li key={error}>{error}</li>)}</ul>
          )}
        </div>
      )}

      {message && <div className="rounded border border-cyan-500/30 bg-cyan-950/10 px-3 py-2 text-[10px] text-cyan-200">{message}</div>}
    </div>
  );
};
