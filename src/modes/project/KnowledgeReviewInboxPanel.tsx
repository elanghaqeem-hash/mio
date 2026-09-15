import React, { useMemo, useState } from 'react';
import { AlertTriangle, Clock3, History, Inbox, ShieldAlert } from 'lucide-react';
import { KnowledgeReviewInbox } from '../../project/KnowledgeReviewInbox';
import type { MioProject } from '../../types/project';

interface Props { project: MioProject; }

export const KnowledgeReviewInboxPanel: React.FC<Props> = ({ project }) => {
  const [selectedAssetId, setSelectedAssetId] = useState<string>('ALL');
  const inbox = useMemo(() => KnowledgeReviewInbox.build(project), [project]);
  const timeline = useMemo(() => KnowledgeReviewInbox.timeline(project, selectedAssetId === 'ALL' ? undefined : selectedAssetId), [project, selectedAssetId]);
  const critical = inbox.filter((item) => item.severity === 'CRITICAL').length;
  const high = inbox.filter((item) => item.severity === 'HIGH').length;

  return (
    <div className="space-y-4 rounded-xl border border-violet-500/20 bg-[#0d121d] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-violet-300"><Inbox size={15} /> KNOWLEDGE REVIEW INBOX &amp; CHANGE TIMELINE</div>
          <div className="mt-1 text-[10px] text-gray-500">Derived review debt plus unified governance/revalidation provenance. Read-only diagnostics; authority remains with existing governance actions.</div>
        </div>
        <div className="flex gap-2 text-[9px]"><span className="rounded border border-rose-500/30 bg-rose-950/20 px-2 py-1 text-rose-300">CRITICAL {critical}</span><span className="rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-amber-300">HIGH {high}</span><span className="rounded border border-violet-500/30 bg-violet-950/20 px-2 py-1 text-violet-300">TOTAL {inbox.length}</span></div>
      </div>

      {inbox.length === 0 ? <div className="rounded border border-dashed border-gray-800 p-4 text-center text-[10px] text-gray-500">No active derived review debt. This does not prove factual correctness; it only means current governance signals do not require review.</div> : (
        <div className="grid gap-2 md:grid-cols-2">
          {inbox.slice(0, 12).map((item) => <button key={item.assetId} onClick={() => setSelectedAssetId(item.assetId)} className={`cursor-pointer rounded-lg border p-3 text-left ${selectedAssetId === item.assetId ? 'border-violet-500/50 bg-violet-950/20' : 'border-gray-800 bg-[#111726] hover:border-gray-700'}`}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-bold text-gray-100">{item.assetName}</div><div className="mt-1 truncate text-[9px] text-gray-600">{item.sourceUri}</div></div><span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold ${item.severity === 'CRITICAL' ? 'border-rose-500/30 text-rose-300' : item.severity === 'HIGH' ? 'border-amber-500/30 text-amber-300' : 'border-cyan-500/20 text-cyan-300'}`}>{item.severity}</span></div>
            <div className="mt-2 flex flex-wrap gap-1">{item.reasons.map((reason) => <span key={reason} className="rounded bg-black/30 px-1.5 py-0.5 text-[8px] text-gray-400">{reason}</span>)}</div>
            <div className="mt-2 flex items-center gap-3 text-[9px] text-gray-500"><span>{item.trust}</span><span>{item.freshness}</span></div>
          </button>)}
        </div>
      )}

      <div className="rounded-lg border border-gray-800 bg-[#090e17] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-gray-300"><History size={13} /> UNIFIED SOURCE TIMELINE</div>
          <select value={selectedAssetId} onChange={(event) => setSelectedAssetId(event.target.value)} className="rounded border border-gray-700 bg-[#111726] px-2 py-1 text-[9px] text-gray-300 outline-none"><option value="ALL">ALL SOURCES</option>{project.assets.filter((asset) => asset.type === 'document').map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>
        </div>
        {timeline.length === 0 ? <div className="text-[10px] text-gray-600">No governance or revalidation events for this filter.</div> : <div className="max-h-72 space-y-1.5 overflow-y-auto">{timeline.slice(0, 75).map((event) => <div key={event.id} className="flex items-start justify-between gap-3 rounded border border-gray-800 bg-[#111726] p-2 text-[9px]"><div className="min-w-0"><div className="flex items-center gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${event.kind === 'REVALIDATION' ? 'bg-violet-950/40 text-violet-300' : 'bg-cyan-950/40 text-cyan-300'}`}>{event.kind}</span><span className="font-bold text-gray-200">{event.action}</span><span className="truncate text-gray-400">{event.assetName}</span></div><div className="mt-1 text-gray-600">{event.detail}</div></div><div className="flex shrink-0 items-center gap-1 text-[8px] text-gray-600"><Clock3 size={9} /> {new Date(event.timestamp).toLocaleString()}</div></div>)}</div>}
      </div>

      <div className="flex gap-2 rounded border border-amber-500/20 bg-amber-950/10 p-2 text-[8px] text-amber-200"><AlertTriangle size={10} className="mt-0.5 shrink-0" /> Inbox severity is deterministic governance triage, not truth confidence. It does not auto-verify, auto-refresh, auto-resolve conflicts, or grant execution authority.</div>
      {critical > 0 && <div className="flex gap-2 text-[8px] text-rose-300"><ShieldAlert size={10} /> Critical means suspicious-content or unresolved-conflict signals require attention; it does not assert the source is false or malicious.</div>}
    </div>
  );
};
