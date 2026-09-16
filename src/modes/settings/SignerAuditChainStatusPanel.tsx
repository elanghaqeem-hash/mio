import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, History, RefreshCw } from 'lucide-react';
import {
  modelSignerTrustStore,
  type ModelSignerAuditVerification,
} from '../../training/SignedModelArtifactProvenance';
import { signerAuditPortableBundleService } from '../../training/SignerAuditPortableBundle';

function downloadJson(name: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}

export const SignerAuditChainStatusPanel: React.FC = () => {
  const [verification, setVerification] = useState<ModelSignerAuditVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVerification(await modelSignerTrustStore.verifyAuditChain());
    } catch (caught) {
      setVerification(null);
      setError(caught instanceof Error ? caught.message : 'Signer audit chain could not be verified');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const exportBundle = async () => {
    setExporting(true);
    setError(null);
    setMessage(null);
    try {
      const bundle = await signerAuditPortableBundleService.exportBundle();
      downloadJson(`mio-signer-audit-verification-${bundle.exportedAt}.json`, bundle);
      setMessage(`Portable verification bundle exported: ${bundle.events.length} events, ${bundle.signers.length} signer records, SHA-256 ${bundle.bundleSha256.slice(0, 20)}…`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Portable signer audit export failed');
    } finally {
      setExporting(false);
    }
  };

  const stateClass = verification?.state === 'VALID'
    ? 'border-emerald-500/30 bg-emerald-950/10 text-emerald-300'
    : verification?.state === 'CORRUPT'
      ? 'border-red-500/40 bg-red-950/20 text-red-300'
      : verification?.state === 'LEGACY_UNCHAINED'
        ? 'border-amber-500/30 bg-amber-950/10 text-amber-300'
        : 'border-gray-700 bg-[#111726] text-gray-400';

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <span className="text-gray-300 font-bold flex items-center gap-2"><History size={14} className="text-violet-400" /> SIGNER TRUST AUDIT INTEGRITY</span>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void exportBundle()} disabled={loading || exporting || verification?.state === 'CORRUPT'} className="flex items-center gap-1.5 rounded border border-cyan-500/30 px-2.5 py-1 text-[10px] text-cyan-300 hover:bg-cyan-950/20 disabled:opacity-50"><Download size={11} /> {exporting ? 'EXPORTING' : 'EXPORT VERIFICATION BUNDLE'}</button>
          <button onClick={() => void refresh()} disabled={loading || exporting} className="flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[10px] text-gray-300 hover:border-violet-500/50 hover:text-violet-300 disabled:opacity-50"><RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> VERIFY CHAIN</button>
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-gray-500">
        TP-0.55 verifies trust-event order, sequence, SHA-256 event hashes, predecessor links, event IDs, signer-index membership, and latest signer state. TP-0.56 can export that verified state as a portable JSON bundle for offline independent verification; only public signer material is included.
      </p>

      {error ? (
        <div className="rounded border border-red-500/40 bg-red-950/20 p-3 text-[10px] text-red-300"><AlertTriangle size={12} className="inline mr-1" />{error}</div>
      ) : (
        <div className={`rounded border p-3 text-[10px] ${stateClass}`}>
          <div className="flex items-center gap-2 font-bold">
            {verification?.state === 'VALID' ? <CheckCircle2 size={13} /> : verification?.state === 'CORRUPT' ? <AlertTriangle size={13} /> : <History size={13} />}
            {loading ? 'VERIFYING' : verification?.state ?? 'UNKNOWN'}
          </div>
          {verification && (
            <div className="mt-1 space-y-1 opacity-90">
              <div>Checked events: {verification.checkedEvents}{verification.latestEventHash ? ` · latest hash ${verification.latestEventHash.slice(0, 20)}…` : ''}</div>
              {verification.state === 'EMPTY' && <div>No signer trust events exist yet. An empty portable bundle can still be exported as a baseline snapshot.</div>}
              {verification.state === 'LEGACY_UNCHAINED' && <div>Legacy TP-0.54 events are readable but not fully hash-chained. The next TP-0.55 event anchors the latest legacy event; historical unanchored records cannot retroactively gain cryptographic integrity.</div>}
              {verification.state === 'CORRUPT' && (
                <ul className="list-disc pl-4 space-y-0.5">{verification.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              )}
            </div>
          )}
        </div>
      )}

      {message && <div className="rounded border border-cyan-500/30 bg-cyan-950/10 px-3 py-2 text-[10px] text-cyan-200">{message}</div>}
      <div className="text-[9px] text-gray-600">Offline verifier: <code>node scripts/training/verify-signer-audit-bundle.mjs &lt;bundle.json&gt;</code>. Export is blocked when the live trust audit is CORRUPT.</div>
    </div>
  );
};
