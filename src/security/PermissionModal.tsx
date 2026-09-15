import React, { useState } from 'react';
import { DryRunRequest } from '../types/security';
import { ShieldAlert, CheckCircle, Eye, XCircle } from 'lucide-react';

interface PermissionModalProps {
  request: DryRunRequest | null;
  onClose: () => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({ request, onClose }) => {
  const [destructiveAcknowledged, setDestructiveAcknowledged] = useState(false);
  if (!request) return null;

  const isDestructive = request.permissionLevel === 'L5_DESTRUCTIVE';
  const canTrustSession = !isDestructive && Boolean(request.onApproveSession);
  const canApprove = !isDestructive || destructiveAcknowledged;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className={`bg-[#0b101b] border rounded-xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${isDestructive ? 'border-red-500/50 shadow-red-950/40' : 'border-cyan-500/40 shadow-cyan-950/50'}`}>
        <div className="flex items-center gap-3 border-b border-gray-800 pb-4 mb-4">
          <div className={`p-2 rounded-lg border ${isDestructive ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}><ShieldAlert size={24} /></div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
              {isDestructive ? 'DESTRUCTIVE ACTION CONFIRMATION' : 'SECURITY CHECK & DRY-RUN PREVIEW'}
              <span className={`text-xs px-2 py-0.5 rounded border font-mono ${isDestructive ? 'bg-red-900/60 text-red-300 border-red-500/30' : 'bg-amber-900/40 text-amber-300 border-amber-500/30'}`}>{request.permissionLevel}</span>
            </h3>
            <p className="text-xs text-gray-400">Approval is bounded to the exact scope, expiry, and use limit shown below.</p>
          </div>
        </div>

        <div className="space-y-3 text-sm font-mono mb-6">
          <div className="bg-[#121927] p-3 rounded border border-gray-800"><span className="text-gray-400 text-xs block">PROPOSED ACTION:</span><span className="text-cyan-300 font-bold">{request.proposedAction}</span></div>
          <div className="bg-[#121927] p-3 rounded border border-gray-800"><span className="text-gray-400 text-xs block">TARGET RESOURCE:</span><span className="text-gray-200">{request.target}</span></div>

          {request.scopeSummary?.length ? <div className="bg-cyan-950/15 p-3 rounded border border-cyan-500/25"><span className="text-cyan-400 text-xs font-bold block">AUTHORIZATION SCOPE:</span><ul className="list-disc list-inside text-gray-300 mt-1 space-y-1 text-xs">{request.scopeSummary.map((scope, i) => <li key={i}>{scope}</li>)}</ul><div className="grid grid-cols-2 gap-2 mt-3 text-[10px]"><div className="rounded border border-gray-800 bg-[#0b101b] p-2"><span className="text-gray-500 block">EXPIRES IN</span><span className="text-cyan-300">{request.expiresInMs ? `${Math.round(request.expiresInMs / 1000)}s` : 'single request'}</span></div><div className="rounded border border-gray-800 bg-[#0b101b] p-2"><span className="text-gray-500 block">MAX USES</span><span className="text-cyan-300">{request.maxUses ?? 1}</span></div></div></div> : null}

          <div className="bg-[#121927] p-3 rounded border border-gray-800"><span className="text-gray-400 text-xs block">PLANNED CHANGES:</span><ul className="list-disc list-inside text-gray-300 mt-1 space-y-1 text-xs">{request.changes.map((change, i) => <li key={i}>{change}</li>)}</ul></div>

          {request.risks.length > 0 && <div className={`${isDestructive ? 'bg-red-950/25 border-red-500/40 text-red-300' : 'bg-amber-950/20 border-amber-500/30 text-amber-300'} p-3 rounded border`}><span className={`${isDestructive ? 'text-red-400' : 'text-amber-400'} text-xs font-bold block`}>IDENTIFIED RISKS:</span><ul className="list-disc list-inside mt-1 space-y-1 text-xs">{request.risks.map((risk, i) => <li key={i}>{risk}</li>)}</ul></div>}

          <div className="bg-[#121927] p-3 rounded border border-gray-800"><span className="text-gray-400 text-xs block">EXPECTED RESULT:</span><span className="text-emerald-400 text-xs">{request.expectedResult}</span></div>

          {isDestructive && <label className="flex cursor-pointer items-start gap-3 rounded border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200"><input type="checkbox" checked={destructiveAcknowledged} onChange={(event) => setDestructiveAcknowledged(event.target.checked)} className="mt-0.5" /><span>I understand this is an L5 destructive operation. I approve only the exact target and bounded single-use scope displayed above.</span></label>}
        </div>

        {canTrustSession && <div className="mb-3 rounded border border-amber-500/30 bg-amber-950/15 p-3 font-mono text-[10px] leading-relaxed text-amber-200">Session trust permits up to {request.sessionMaxUses ?? 60} matching AI requests, expires after {Math.round((request.sessionIdleTtlMs ?? 0) / 60_000)} minutes idle or {Math.round((request.sessionAbsoluteTtlMs ?? 0) / 60_000)} minutes total, and is revoked by STOP MIO. It is not saved after this browser runtime ends.</div>}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-800">
          <button onClick={() => { request.onCancel(); onClose(); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition cursor-pointer"><XCircle size={16} /> CANCEL</button>
          <button onClick={() => { request.onReview(); onClose(); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-950 border border-cyan-500/40 hover:bg-cyan-900/60 text-cyan-300 text-sm font-medium transition cursor-pointer"><Eye size={16} /> REVIEW</button>
          <button disabled={!canApprove} onClick={() => { if (!canApprove) return; request.onApprove(); onClose(); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition ${canApprove ? isDestructive ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/20 cursor-pointer' : 'border border-cyan-500/50 bg-cyan-950 text-cyan-200 hover:bg-cyan-900/60 cursor-pointer' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}><CheckCircle size={16} /> {isDestructive ? 'CONFIRM L5 DESTRUCTIVE ACTION' : 'APPROVE ONCE'}</button>
          {canTrustSession && <button onClick={() => { request.onApproveSession?.(); onClose(); }} className="flex cursor-pointer items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-black shadow-lg shadow-cyan-500/30 transition hover:bg-cyan-400"><CheckCircle size={16} /> TRUST SESSION · {request.sessionMaxUses ?? 60}</button>}
        </div>
      </div>
    </div>
  );
};
