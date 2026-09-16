import React, { useState } from 'react';
import { FileKey2, FileCheck2, ShieldAlert } from 'lucide-react';
import {
  signedCandidateEvidencePackageService,
  type SignedCandidateEvidenceVerification,
} from '../../training/SignedCandidateEvidencePackage';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const SignedCandidateEvidencePanel: React.FC = () => {
  const [fileName, setFileName] = useState('');
  const [verification, setVerification] = useState<SignedCandidateEvidenceVerification | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const verifyFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setVerification(null);
    setMessage(null);
    if (file.size > MAX_FILE_BYTES) {
      setMessage(`${file.name} exceeds the 20 MiB signed candidate-evidence verification limit.`);
      return;
    }
    setBusy(true);
    try {
      const result = await signedCandidateEvidencePackageService.verify(await file.text());
      setVerification(result);
      setMessage(result.valid
        ? 'Signature, embedded TP-0.60 package, and current MIO signer trust all verify. This remains audit evidence only; no model state was changed.'
        : `Signed candidate evidence blocked: ${result.errors.join('; ')}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Signed candidate evidence verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
      <div className="flex items-center gap-2 text-gray-300 font-bold">
        <FileKey2 size={14} className="text-cyan-400" /> TRUSTED SIGNED CANDIDATE EVIDENCE
      </div>
      <p className="text-[10px] leading-relaxed text-gray-500">
        Verify a TP-0.61 signed TP-0.60 evidence package against the existing MIO trusted-signer store. Mio accepts public trust material only; private signing keys must remain outside the application and are never requested by this panel.
      </p>
      <div className="rounded border border-amber-500/20 bg-amber-950/10 p-3 text-[9px] leading-relaxed text-amber-200">
        Sign externally with <code>scripts/training/sign-candidate-evidence-package.mjs</code>. Trust the corresponding P-256 public key through the existing signer-trust workflow first. A valid signature is not a promotion, activation, deployment, or safety decision.
      </div>

      <label className="block cursor-pointer rounded border border-gray-700 bg-[#111726] p-3 hover:border-cyan-500/40">
        <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400"><FileCheck2 size={11} /> SIGNED CANDIDATE EVIDENCE ENVELOPE</span>
        <span className="mt-1 block truncate text-[10px] text-gray-500">{fileName || 'Choose signed-candidate-evidence.json…'}</span>
        <input type="file" accept=".json,application/json" className="hidden" disabled={busy} onChange={(event) => void verifyFile(event.target.files?.[0])} />
      </label>

      {verification && (
        <div className={`rounded border p-3 text-[10px] ${verification.valid ? 'border-emerald-500/30 bg-emerald-950/10 text-emerald-300' : 'border-red-500/30 bg-red-950/10 text-red-300'}`}>
          <div className="flex items-center gap-1.5 font-bold">
            {verification.valid ? <FileCheck2 size={12} /> : <ShieldAlert size={12} />}
            {verification.valid ? 'TRUSTED SIGNATURE VERIFIED' : 'SIGNED EVIDENCE BLOCKED'}
          </div>
          {verification.valid ? (
            <div className="mt-2 grid gap-1 text-gray-400 md:grid-cols-2">
              <span>Signer: <strong className="text-gray-200">{verification.signerLabel}</strong></span>
              <span>Trust: <strong className="text-emerald-300">{verification.signerStatus}</strong></span>
              <span className="md:col-span-2">Key ID: <code>{verification.signerKeyId}</code></span>
              <span className="md:col-span-2">Payload SHA: <code>{verification.payloadSha256}</code></span>
              <span className="md:col-span-2">Envelope SHA: <code>{verification.envelopeSha256}</code></span>
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
