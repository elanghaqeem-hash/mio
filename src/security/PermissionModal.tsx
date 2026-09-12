import React from 'react';
import { DryRunRequest } from '../types/security';
import { ShieldAlert, CheckCircle, Eye, XCircle } from 'lucide-react';

interface PermissionModalProps {
  request: DryRunRequest | null;
  onClose: () => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({ request, onClose }) => {
  if (!request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-[#0b101b] border border-cyan-500/40 rounded-xl max-w-xl w-full p-6 shadow-2xl shadow-cyan-950/50 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 border-b border-gray-800 pb-4 mb-4">
          <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30"><ShieldAlert size={24} /></div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
              SECURITY CHECK &amp; DRY-RUN PREVIEW
              <span className="text-xs px-2 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-500/30 font-mono">{request.permissionLevel}</span>
            </h3>
            <p className="text-xs text-gray-400">Approval is bounded to the scope, expiry, and use limit shown below.</p>
          </div>
        </div>

        <div className="space-y-3 text-sm font-mono mb-6">
          <div className="bg-[#121927] p-3 rounded border border-gray-800">
            <span className="text-gray-400 text-xs block">PROPOSED ACTION:</span>
            <span className="text-cyan-300 font-bold">{request.proposedAction}</span>
          </div>

          <div className="bg-[#121927] p-3 rounded border border-gray-800">
            <span className="text-gray-400 text-xs block">TARGET RESOURCE:</span>
            <span className="text-gray-200">{request.target}</span>
          </div>

          {request.scopeSummary?.length ? (
            <div className="bg-cyan-950/15 p-3 rounded border border-cyan-500/25">
              <span className="text-cyan-400 text-xs font-bold block">AUTHORIZATION SCOPE:</span>
              <ul className="list-disc list-inside text-gray-300 mt-1 space-y-1 text-xs">
                {request.scopeSummary.map((scope, i) => <li key={i}>{scope}</li>)}
              </ul>
              <div className="grid grid-cols-2 gap-2 mt-3 text-[10px]">
                <div className="rounded border border-gray-800 bg-[#0b101b] p-2"><span className="text-gray-500 block">EXPIRES IN</span><span className="text-cyan-300">{request.expiresInMs ? `${Math.round(request.expiresInMs / 1000)}s` : 'single request'}</span></div>
                <div className="rounded border border-gray-800 bg-[#0b101b] p-2"><span className="text-gray-500 block">MAX USES</span><span className="text-cyan-300">{request.maxUses ?? 1}</span></div>
              </div>
            </div>
          ) : null}

          <div className="bg-[#121927] p-3 rounded border border-gray-800">
            <span className="text-gray-400 text-xs block">PLANNED CHANGES:</span>
            <ul className="list-disc list-inside text-gray-300 mt-1 space-y-1 text-xs">
              {request.changes.map((change, i) => <li key={i}>{change}</li>)}
            </ul>
          </div>

          {request.risks.length > 0 && (
            <div className="bg-amber-950/20 p-3 rounded border border-amber-500/30 text-amber-300">
              <span className="text-amber-400 text-xs font-bold block">IDENTIFIED RISKS:</span>
              <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
                {request.risks.map((risk, i) => <li key={i}>{risk}</li>)}
              </ul>
            </div>
          )}

          <div className="bg-[#121927] p-3 rounded border border-gray-800">
            <span className="text-gray-400 text-xs block">EXPECTED RESULT:</span>
            <span className="text-emerald-400 text-xs">{request.expectedResult}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-800">
          <button onClick={() => { request.onCancel(); onClose(); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition cursor-pointer"><XCircle size={16} /> CANCEL</button>
          <button onClick={() => { request.onReview(); onClose(); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-950 border border-cyan-500/40 hover:bg-cyan-900/60 text-cyan-300 text-sm font-medium transition cursor-pointer"><Eye size={16} /> REVIEW</button>
          <button onClick={() => { request.onApprove(); onClose(); }} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm shadow-lg shadow-cyan-500/30 transition cursor-pointer"><CheckCircle size={16} /> APPROVE BOUNDED SCOPE</button>
        </div>
      </div>
    </div>
  );
};
