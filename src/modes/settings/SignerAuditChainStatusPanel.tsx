import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, RefreshCw } from 'lucide-react';
import {
  modelSignerTrustStore,
  type ModelSignerAuditVerification,
} from '../../training/SignedModelArtifactProvenance';

export const SignerAuditChainStatusPanel: React.FC = () => {
  const [verification, setVerification] = useState<ModelSignerAuditVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const stateClass = verification?.state === 'VALID'
    ? 'border-emerald-500/30 bg-emerald-950/10 text-emerald-300'
    : verification?.state === 'CORRUPT'
      ? 'border-red-500/40 bg-red-950/20 text-red-300'
      : verification?.state === 'LEGACY_UNCHAINED'
        ? 'border-amber-500/30 bg-amber-950/10 text-amber-300'
        : 'border-gray-700 bg-[#111726] text-gray-400';

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-gray-300 font-bold flex items-center gap-2"><History size={14} className="text-violet-400" /> SIGNER TRUST AUDIT INTEGRITY</span>
        <button onClick={() => void refresh()} disabled={loading} className="flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[10px] text-gray-300 hover:border-violet-500/50 hover:text-violet-300 disabled:opacity-50"><RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> VERIFY CHAIN</button>
      </div>

      <p className="text-[10px] leading-relaxed text-gray-500">
        TP-0.55 verifies trust-event order, sequence, SHA-256 event hashes, predecessor links, event IDs, signer-index membership, and latest signer state. Trust-sensitive provenance operations fail closed when this chain is CORRUPT.
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
              {verification.state === 'EMPTY' && <div>No signer trust events exist yet.</div>}
              {verification.state === 'LEGACY_UNCHAINED' && <div>Legacy TP-0.54 events are readable but not fully hash-chained. The next TP-0.55 event anchors the latest legacy event; historical unanchored records cannot retroactively gain cryptographic integrity.</div>}
              {verification.state === 'CORRUPT' && (
                <ul className="list-disc pl-4 space-y-0.5">{verification.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
