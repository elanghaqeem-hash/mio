import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, BadgeCheck, Download, FileSignature, History, KeyRound, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import {
  modelSignerTrustStore,
  trainingCandidateProvenanceService,
  type ModelSignerTrustEvent,
  type TrustedModelSigner,
} from '../../training/SignedModelArtifactProvenance';
import {
  trainingCandidateReviewService,
  type TrainingCandidateReviewSnapshot,
} from '../../training/TrainingCandidateReviewService';

const MAX_SIGNED_PROVENANCE_BYTES = 2 * 1024 * 1024;

function safeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'candidate';
}

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

export const ModelProvenancePanel: React.FC = () => {
  const [signers, setSigners] = useState<TrustedModelSigner[]>([]);
  const [auditEvents, setAuditEvents] = useState<ModelSignerTrustEvent[]>([]);
  const [candidates, setCandidates] = useState<TrainingCandidateReviewSnapshot[]>([]);
  const [actor, setActor] = useState('');
  const [reason, setReason] = useState('');
  const [signerLabel, setSignerLabel] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [rotationCurrentKeyId, setRotationCurrentKeyId] = useState('');
  const [replacementLabel, setReplacementLabel] = useState('');
  const [replacementPublicKey, setReplacementPublicKey] = useState('');
  const [issuerByCandidate, setIssuerByCandidate] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const trustedSigners = useMemo(() => signers.filter((signer) => signer.status === 'TRUSTED'), [signers]);

  const refresh = useCallback(async () => {
    const [nextSigners, nextCandidates, nextAudit] = await Promise.all([
      modelSignerTrustStore.list(),
      trainingCandidateReviewService.list(),
      modelSignerTrustStore.history(undefined, 50),
    ]);
    setSigners(nextSigners);
    setCandidates(nextCandidates);
    setAuditEvents(nextAudit);
    setRotationCurrentKeyId((current) => {
      if (nextSigners.some((signer) => signer.keyId === current && signer.status === 'TRUSTED')) return current;
      return nextSigners.find((signer) => signer.status === 'TRUSTED')?.keyId ?? '';
    });
    setIssuerByCandidate((current) => {
      const next = { ...current };
      for (const snapshot of nextCandidates) next[snapshot.candidate.id] ??= 'MIO Model Release';
      return next;
    });
  }, []);

  useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : 'Signed provenance state could not be loaded'));
  }, [refresh]);

  const trustSigner = async () => {
    setBusy('trust');
    setMessage(null);
    try {
      const signer = await modelSignerTrustStore.trust(signerLabel, publicKey, actor, reason);
      setSignerLabel('');
      setPublicKey('');
      setReason('');
      setMessage(`Trusted signer ${signer.label} as ${signer.keyId}. The mutation was recorded in the immutable trust audit; only the public key is stored by Mio.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Signer trust import failed');
    } finally {
      setBusy(null);
    }
  };

  const revokeSigner = async (keyId: string) => {
    setBusy(`revoke:${keyId}`);
    setMessage(null);
    try {
      const signer = await modelSignerTrustStore.revoke(keyId, actor, reason);
      setReason('');
      setMessage(`Signer ${signer.label} is REVOKED and the action is audit-recorded. Existing signatures remain evidence but no longer satisfy release, promotion, or activation trust.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Signer revocation failed');
    } finally {
      setBusy(null);
    }
  };

  const rotateSigner = async () => {
    setBusy('rotate');
    setMessage(null);
    try {
      const result = await modelSignerTrustStore.rotate({
        currentKeyId: rotationCurrentKeyId,
        replacementLabel,
        replacementPublicKey,
        actor,
        reason,
      });
      setReplacementLabel('');
      setReplacementPublicKey('');
      setReason('');
      setMessage(`Signer rotation ${result.rotationId} completed. ${result.previous.keyId} is REVOKED and ${result.replacement.keyId} is TRUSTED. Existing provenance signed by the old key remains historical evidence and will fail current-trust gates.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Signer rotation failed');
    } finally {
      setBusy(null);
    }
  };

  const preparePayload = async (snapshot: TrainingCandidateReviewSnapshot) => {
    const candidateId = snapshot.candidate.id;
    setBusy(`payload:${candidateId}`);
    setMessage(null);
    try {
      const payload = await trainingCandidateProvenanceService.buildSigningPayload(
        candidateId,
        issuerByCandidate[candidateId] ?? 'MIO Model Release',
      );
      downloadJson(`mio-provenance-payload-${safeFileName(snapshot.manifest.runtimeModel)}.json`, payload);
      setMessage('Signing payload prepared from the current candidate + adapter fingerprint. Sign it outside Mio with the TP-0.53 offline signing utility, then import the signed envelope below.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Signing payload preparation failed');
    } finally {
      setBusy(null);
    }
  };

  const verifyEnvelope = async (candidateId: string, file?: File) => {
    if (!file) return;
    setBusy(`verify:${candidateId}`);
    setMessage(null);
    try {
      if (file.size > MAX_SIGNED_PROVENANCE_BYTES) throw new Error('Signed provenance file exceeds the 2 MiB import limit');
      const evidence = await trainingCandidateProvenanceService.verifyAndBind(candidateId, await file.text());
      setMessage(`SIGNED PROVENANCE VERIFIED — signer ${evidence.signerLabel}, key ${evidence.signerKeyId}, artifact ${evidence.artifactFingerprint.slice(0, 16)}…. No lifecycle or activation change occurred.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Signed provenance verification failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-gray-300 font-bold flex items-center gap-2"><FileSignature size={14} className="text-amber-400" /> SIGNED MODEL ARTIFACT PROVENANCE</span>
        <button onClick={() => void refresh()} disabled={busy !== null} className="flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[10px] text-gray-300 hover:border-amber-500/50 hover:text-amber-300 disabled:opacity-50"><RefreshCw size={11} /> REFRESH</button>
      </div>

      <p className="text-[10px] leading-relaxed text-gray-500">
        Signature validity and signer trust are separate. Mio stores only explicitly trusted P-256 public keys. Private signing keys stay outside Mio. Trust changes are auditable and key rotation is explicit; neither action promotes or activates a model.
      </p>

      <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 space-y-2">
        <div className="font-bold text-amber-300">TRUST MUTATION IDENTITY</div>
        <div className="grid gap-2 md:grid-cols-2">
          <input value={actor} onChange={(event) => setActor(event.target.value)} maxLength={200} placeholder="Actor / operator identity (required)" className="rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Reason / ticket / change reference (optional)" className="rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white" />
        </div>
        <div className="text-[9px] text-gray-500">Every trust, re-trust, revoke, and rotation action is recorded with actor, timestamp, prior/resulting state, and optional reason. Audit capacity is bounded; mutations fail closed if audit persistence cannot be completed.</div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-[#111726] p-3 space-y-3">
        <div className="font-bold text-gray-200 flex items-center gap-2"><KeyRound size={13} className="text-amber-400" /> TRUSTED MODEL SIGNERS</div>
        <div className="grid gap-2 md:grid-cols-[220px_1fr_auto]">
          <input value={signerLabel} onChange={(event) => setSignerLabel(event.target.value)} maxLength={200} placeholder="Signer label / owner" className="rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white" />
          <textarea value={publicKey} onChange={(event) => setPublicKey(event.target.value)} placeholder="P-256 public key — PEM SubjectPublicKeyInfo or base64 SPKI" rows={3} className="resize-y rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-[10px] text-white" />
          <button onClick={() => void trustSigner()} disabled={busy !== null || !actor.trim() || !signerLabel.trim() || !publicKey.trim()} className="rounded border border-amber-500/40 px-3 py-2 text-[10px] font-bold text-amber-300 hover:bg-amber-950/20 disabled:border-gray-700 disabled:text-gray-600">{busy === 'trust' ? 'VALIDATING…' : 'TRUST PUBLIC KEY'}</button>
        </div>
        {signers.length === 0 ? (
          <div className="text-[9px] text-gray-600">No trusted model-signing public keys.</div>
        ) : (
          <div className="space-y-1.5">
            {signers.map((signer) => (
              <div key={signer.keyId} className="flex flex-col gap-2 rounded border border-gray-800 bg-[#0a0f18] p-2.5 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-gray-200">{signer.label}</div>
                  <div className="mt-0.5 truncate text-[9px] text-gray-500">{signer.keyId}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded border px-2 py-1 text-[9px] font-bold ${signer.status === 'TRUSTED' ? 'border-emerald-500/30 text-emerald-300' : 'border-red-500/30 text-red-300'}`}>{signer.status}</span>
                  {signer.status === 'TRUSTED' && <button onClick={() => void revokeSigner(signer.keyId)} disabled={busy !== null || !actor.trim()} className="rounded border border-red-500/30 px-2 py-1 text-[9px] font-bold text-red-300 hover:bg-red-950/20 disabled:opacity-50"><Ban size={10} className="inline mr-1" />REVOKE</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3 space-y-3">
        <div className="font-bold text-cyan-300 flex items-center gap-2"><RotateCcw size={13} /> EXPLICIT SIGNER KEY ROTATION</div>
        <p className="text-[9px] text-gray-500">Rotation first validates/trusts the replacement public key, then revokes the selected current signer under one rotation ID. If current-key revocation fails, Mio attempts to revoke a newly introduced replacement as a safe rollback.</p>
        <select value={rotationCurrentKeyId} onChange={(event) => setRotationCurrentKeyId(event.target.value)} className="w-full rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white">
          <option value="">Select current TRUSTED signer</option>
          {trustedSigners.map((signer) => <option key={signer.keyId} value={signer.keyId}>{signer.label} — {signer.keyId}</option>)}
        </select>
        <div className="grid gap-2 md:grid-cols-[220px_1fr_auto]">
          <input value={replacementLabel} onChange={(event) => setReplacementLabel(event.target.value)} maxLength={200} placeholder="Replacement signer label" className="rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white" />
          <textarea value={replacementPublicKey} onChange={(event) => setReplacementPublicKey(event.target.value)} rows={3} placeholder="Replacement P-256 public key — PEM or base64 SPKI" className="resize-y rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-[10px] text-white" />
          <button onClick={() => void rotateSigner()} disabled={busy !== null || !actor.trim() || !rotationCurrentKeyId || !replacementLabel.trim() || !replacementPublicKey.trim()} className="rounded border border-cyan-500/40 px-3 py-2 text-[10px] font-bold text-cyan-300 hover:bg-cyan-950/20 disabled:border-gray-700 disabled:text-gray-600">{busy === 'rotate' ? 'ROTATING…' : 'ROTATE SIGNER'}</button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-[#111726] p-3 space-y-2">
        <div className="font-bold text-gray-200 flex items-center gap-2"><History size={13} className="text-violet-400" /> SIGNER TRUST AUDIT</div>
        {auditEvents.length === 0 ? (
          <div className="text-[9px] text-gray-600">No signer trust audit events yet. Signers created before TP-0.54 remain readable; their first subsequent trust mutation starts the append-only audit trail.</div>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {auditEvents.map((event) => (
              <div key={event.id} className="rounded border border-gray-800 bg-[#0a0f18] p-2 text-[9px] text-gray-400">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-bold ${event.resultingStatus === 'TRUSTED' ? 'text-emerald-300' : 'text-red-300'}`}>#{event.sequence} {event.action}</span>
                  <span>{new Date(event.occurredAt).toLocaleString()}</span>
                  <span>actor <strong className="text-gray-200">{event.actor}</strong></span>
                </div>
                <div className="mt-1 truncate">{event.label} · <code>{event.keyId}</code></div>
                <div className="mt-1">{event.previousStatus ?? 'NONE'} → <strong>{event.resultingStatus}</strong>{event.rotationId ? ` · ${event.rotationId}` : ''}</div>
                {event.reason && <div className="mt-1 text-gray-500">Reason: {event.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="font-bold text-gray-200 flex items-center gap-2"><ShieldCheck size={13} className="text-emerald-400" /> CANDIDATE PROVENANCE BINDING</div>
        {candidates.length === 0 ? (
          <div className="rounded border border-gray-800 bg-[#111726] p-3 text-[10px] text-gray-500">No registered model candidates.</div>
        ) : candidates.map((snapshot) => {
          const id = snapshot.candidate.id;
          const integrity = snapshot.latestIntegrity;
          const provenance = snapshot.latestProvenance;
          const canPrepare = Boolean(integrity && integrity.comparison !== 'DRIFT');
          return (
            <div key={id} className="rounded-lg border border-gray-800 bg-[#111726] p-3 space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="font-bold text-gray-200 truncate">{snapshot.manifest.displayName}</div>
                  <div className="mt-1 text-[9px] text-gray-500 truncate">{snapshot.manifest.runtimeModel} · {snapshot.manifest.lifecycle}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`rounded border px-2 py-1 text-[9px] font-bold ${integrity?.comparison === 'DRIFT' ? 'border-red-500/30 text-red-300' : integrity ? 'border-cyan-500/30 text-cyan-300' : 'border-gray-700 text-gray-500'}`}>{integrity ? `INTEGRITY ${integrity.comparison}` : 'NO INTEGRITY'}</span>
                  {provenance && <span className={`rounded border px-2 py-1 text-[9px] font-bold ${snapshot.provenanceSignerStatus === 'TRUSTED' ? 'border-emerald-500/30 text-emerald-300' : 'border-red-500/30 text-red-300'}`}>SIGNED · {snapshot.provenanceSignerStatus ?? 'UNKNOWN'}</span>}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                <input value={issuerByCandidate[id] ?? ''} onChange={(event) => setIssuerByCandidate((current) => ({ ...current, [id]: event.target.value }))} maxLength={200} placeholder="Issuer / signing authority label" className="rounded border border-gray-700 bg-[#0a0f18] px-2.5 py-2 text-xs text-white" />
                <button onClick={() => void preparePayload(snapshot)} disabled={busy !== null || !canPrepare || !(issuerByCandidate[id] ?? '').trim()} className="rounded border border-amber-500/40 px-3 py-2 text-[9px] font-bold text-amber-300 hover:bg-amber-950/20 disabled:border-gray-700 disabled:text-gray-600"><Download size={10} className="inline mr-1" />PREPARE SIGNING PAYLOAD</button>
                <label className={`cursor-pointer rounded border px-3 py-2 text-center text-[9px] font-bold ${busy !== null ? 'pointer-events-none border-gray-700 text-gray-600' : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/20'}`}>
                  <BadgeCheck size={10} className="inline mr-1" />VERIFY SIGNED PROVENANCE
                  <input type="file" accept=".json,application/json" className="hidden" disabled={busy !== null} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void verifyEnvelope(id, file); }} />
                </label>
              </div>

              {provenance && (
                <div className="rounded border border-emerald-500/20 bg-emerald-950/10 p-2.5 text-[9px] text-gray-400">
                  <div className="font-bold text-emerald-300">LATEST VERIFIED SIGNED PROVENANCE</div>
                  <div className="mt-1 grid gap-1 md:grid-cols-2">
                    <span>Signer: <strong className="text-gray-200">{provenance.signerLabel}</strong></span>
                    <span>Issuer: <strong className="text-gray-200">{provenance.issuer}</strong></span>
                    <span>Key: <code>{provenance.signerKeyId.slice(0, 28)}…</code></span>
                    <span>Artifact: <code>{provenance.artifactFingerprint.slice(0, 20)}…</code></span>
                  </div>
                  {snapshot.provenanceSignerStatus !== 'TRUSTED' && <div className="mt-1 text-red-300">The signing key is no longer trusted. This evidence remains in audit history but blocks release review while present.</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded border border-amber-500/20 bg-amber-950/10 p-2.5 text-[9px] text-amber-300">
        Signing workflow: prepare the payload here, sign it offline with <code>scripts/training/sign-model-artifact-provenance.mjs</code>, trust only the corresponding public key in Mio, then import the signed envelope. Never paste or import a private signing key into Mio.
      </div>

      {message && <div className="rounded border border-amber-500/30 bg-amber-950/10 px-3 py-2 text-[10px] text-amber-200">{message}</div>}
    </div>
  );
};
