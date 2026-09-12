import React, { useMemo, useState } from 'react';
import { Activity, ArrowRightLeft, BookOpenCheck, CheckCircle2, CircleOff, Clock3, History, ListChecks, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { KnowledgeHealth } from '../../project/KnowledgeHealth';
import { ProjectManager } from '../../project/ProjectManager';
import type { KnowledgeSourcePriority, MioProject } from '../../types/project';

interface Props { project: MioProject; }

function freshnessLabel(freshUntil?: number): 'CURRENT' | 'STALE' | 'UNKNOWN' {
  if (!freshUntil) return 'UNKNOWN';
  return freshUntil >= Date.now() ? 'CURRENT' : 'STALE';
}

export const KnowledgeGovernancePanel: React.FC<Props> = ({ project }) => {
  const [reviewNote, setReviewNote] = useState('Reviewed in Knowledge Governance Center');
  const [replacementByAsset, setReplacementByAsset] = useState<Record<string, string>>({});
  const documents = useMemo(() => project.assets.filter((asset) => asset.type === 'document'), [project.assets]);
  const history = project.knowledgeGovernance?.history ?? [];
  const health = useMemo(() => KnowledgeHealth.evaluate(project), [project]);
  const reviewQueue = useMemo(() => documents.filter((asset) => {
    const record = project.knowledgeGovernance.sources[asset.id];
    return !record?.supersededByAssetId && (record?.trust !== 'VERIFIED' || freshnessLabel(record?.freshUntil) !== 'CURRENT');
  }), [documents, project.knowledgeGovernance.sources]);

  const review = (assetId: string, trust: 'VERIFIED' | 'QUARANTINED') => {
    const horizon = trust === 'VERIFIED' ? Date.now() + 30 * 24 * 60 * 60 * 1000 : undefined;
    ProjectManager.reviewKnowledgeSource(assetId, trust, reviewNote.trim() || undefined, horizon);
  };

  const supersede = (assetId: string) => {
    const replacementId = replacementByAsset[assetId];
    if (!replacementId) return;
    if (ProjectManager.supersedeKnowledgeSource(assetId, replacementId)) setReplacementByAsset((current) => ({ ...current, [assetId]: '' }));
  };

  const setPriority = (assetId: string, priority: KnowledgeSourcePriority) => {
    ProjectManager.setKnowledgeSourcePriority(assetId, priority);
  };

  return (
    <div className="space-y-4 rounded-xl border border-cyan-500/20 bg-[#0d121d] p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 font-bold text-cyan-300"><BookOpenCheck size={16} /> KNOWLEDGE GOVERNANCE CENTER</div>
          <div className="mt-1 text-[10px] text-gray-500">Project-scoped source policy, review queue, priority, freshness, supersession, potential conflicts and provenance.</div>
        </div>
        <div className="flex gap-2 text-[9px]">
          <span className={`rounded border px-2 py-1 ${health.confidence === 'HIGH' ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300' : health.confidence === 'MEDIUM' ? 'border-amber-500/30 bg-amber-950/20 text-amber-300' : 'border-rose-500/30 bg-rose-950/20 text-rose-300'}`}>HEALTH {health.healthScore}/100 · {health.confidence}</span>
          <span className="rounded border border-rose-500/30 bg-rose-950/20 px-2 py-1 text-rose-300">REVIEW QUEUE {reviewQueue.length}</span>
          <span className="rounded border border-emerald-500/30 bg-emerald-950/20 px-2 py-1 text-emerald-300">VERIFIED {documents.filter((asset) => project.knowledgeGovernance.sources[asset.id]?.trust === 'VERIFIED').length}</span>
          <span className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-400">HISTORY {history.length}</span>
        </div>
      </div>

      <div className="rounded-lg border border-violet-500/20 bg-violet-950/10 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-violet-300"><Activity size={13} /> PROJECT KNOWLEDGE HEALTH</div>
          <span className="text-[8px] text-gray-600">{health.method}</span>
        </div>
        <div className="grid grid-cols-5 gap-2 text-center text-[9px]">
          <div className="rounded border border-gray-800 bg-[#111726] p-2"><div className="text-lg font-bold text-cyan-300">{health.activeSources}</div><div className="text-gray-500">ACTIVE</div></div>
          <div className="rounded border border-gray-800 bg-[#111726] p-2"><div className="text-lg font-bold text-emerald-300">{health.verifiedSources}</div><div className="text-gray-500">VERIFIED</div></div>
          <div className="rounded border border-gray-800 bg-[#111726] p-2"><div className="text-lg font-bold text-blue-300">{health.currentSources}</div><div className="text-gray-500">CURRENT</div></div>
          <div className="rounded border border-gray-800 bg-[#111726] p-2"><div className="text-lg font-bold text-violet-300">{health.primarySources}</div><div className="text-gray-500">PRIMARY</div></div>
          <div className="rounded border border-gray-800 bg-[#111726] p-2"><div className="text-lg font-bold text-rose-300">{health.potentialConflicts.length}</div><div className="text-gray-500">POTENTIAL CONFLICT</div></div>
        </div>
        {health.potentialConflicts.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {health.potentialConflicts.slice(0, 5).map((conflict, index) => {
              const left = project.assets.find((asset) => asset.id === conflict.leftAssetId);
              const right = project.assets.find((asset) => asset.id === conflict.rightAssetId);
              return <div key={`${conflict.leftAssetId}-${conflict.rightAssetId}-${index}`} className="rounded border border-amber-500/20 bg-amber-950/10 p-2 text-[9px]"><div className="flex items-center gap-1.5 font-bold text-amber-300"><TriangleAlert size={10} /> POTENTIAL_CONFLICT · {conflict.reason}</div><div className="mt-1 text-gray-300">{left?.name ?? conflict.leftAssetId} ↔ {right?.name ?? conflict.rightAssetId}</div><div className="mt-0.5 text-gray-600">Shared terms: {conflict.sharedTerms.join(', ')}</div><div className="mt-1 grid grid-cols-2 gap-2 text-gray-500"><div className="rounded bg-black/20 p-1.5">{conflict.leftSignal}</div><div className="rounded bg-black/20 p-1.5">{conflict.rightSignal}</div></div></div>;
            })}
          </div>
        )}
        <div className="mt-2 text-[8px] text-gray-600">Health and conflict labels are bounded governance heuristics. POTENTIAL_CONFLICT is a review signal, not a semantic contradiction or truth judgment.</div>
      </div>

      {reviewQueue.length > 0 && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-950/10 p-3">
          <div className="mb-2 flex items-center gap-2 font-bold text-rose-300"><ListChecks size={13} /> SOURCE REVIEW QUEUE</div>
          <div className="flex flex-wrap gap-2">
            {reviewQueue.map((asset) => {
              const record = project.knowledgeGovernance.sources[asset.id];
              return <span key={`queue-${asset.id}`} className="rounded border border-gray-800 bg-[#111726] px-2 py-1 text-[9px] text-gray-300">{asset.name} · {record?.trust ?? 'QUARANTINED'} · {freshnessLabel(record?.freshUntil)}</span>;
            })}
          </div>
          <div className="mt-2 text-[8px] text-gray-600">Queue is derived from project governance state: quarantined, stale, or never-freshness-reviewed active sources require attention.</div>
        </div>
      )}

      <div className="rounded-lg border border-gray-800 bg-[#090e17] p-3">
        <label className="mb-1 block text-[9px] font-bold text-gray-500">REVIEW NOTE FOR NEXT TRUST DECISION</label>
        <input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="w-full rounded border border-gray-700 bg-black/30 px-3 py-2 text-[10px] text-gray-300 outline-none focus:border-cyan-500/40" />
      </div>

      {documents.length === 0 ? (
        <div className="rounded border border-dashed border-gray-800 p-6 text-center text-gray-500">No document sources have been imported into this project.</div>
      ) : (
        <div className="space-y-2">
          {documents.map((asset) => {
            const record = project.knowledgeGovernance.sources[asset.id];
            const trust = record?.trust ?? (asset.verified ? 'VERIFIED' : 'QUARANTINED');
            const included = record?.included !== false && !record?.supersededByAssetId;
            const freshness = freshnessLabel(record?.freshUntil);
            const sourcePriority = record?.priority ?? 'STANDARD';
            const replacementOptions = documents.filter((candidate) => candidate.id !== asset.id && !project.knowledgeGovernance.sources[candidate.id]?.supersededByAssetId);
            return (
              <div key={asset.id} className="rounded-lg border border-gray-800 bg-[#111726] p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold text-gray-100">{asset.name}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${trust === 'VERIFIED' ? 'bg-emerald-950/50 text-emerald-300' : 'bg-amber-950/50 text-amber-300'}`}>{trust}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[8px] ${freshness === 'CURRENT' ? 'bg-cyan-950/50 text-cyan-300' : freshness === 'STALE' ? 'bg-rose-950/50 text-rose-300' : 'bg-gray-900 text-gray-500'}`}>{freshness}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[8px] ${sourcePriority === 'PRIMARY' ? 'bg-violet-950/50 text-violet-300' : sourcePriority === 'LOW' ? 'bg-gray-900 text-gray-500' : 'bg-blue-950/40 text-blue-300'}`}>{sourcePriority}</span>
                      {!included && <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[8px] text-gray-500">EXCLUDED</span>}
                    </div>
                    <div className="mt-1 truncate text-[9px] text-gray-500">{asset.filePath || `project-asset://${asset.id}`}</div>
                    {record?.reviewedAt && <div className="mt-1 text-[9px] text-gray-600">Reviewed {new Date(record.reviewedAt).toLocaleString()} {record.reviewNote ? `· ${record.reviewNote}` : ''}</div>}
                    {record?.supersededByAssetId && <div className="mt-1 text-[9px] text-rose-300">Superseded by {documents.find((item) => item.id === record.supersededByAssetId)?.name ?? record.supersededByAssetId}</div>}
                  </div>

                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {!record?.supersededByAssetId && <select value={sourcePriority} onChange={(event) => setPriority(asset.id, event.target.value as KnowledgeSourcePriority)} className="rounded border border-violet-500/20 bg-[#090e17] px-2 py-1 text-[9px] text-violet-300 outline-none" title="Priority adjusts ranking only after lexical relevance exists."><option value="PRIMARY">PRIMARY</option><option value="STANDARD">STANDARD</option><option value="LOW">LOW</option></select>}
                    {!record?.supersededByAssetId && <button onClick={() => ProjectManager.setKnowledgeSourceIncluded(asset.id, !included)} className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[9px] text-gray-300 hover:border-cyan-500/40 hover:text-cyan-300">{included ? <CircleOff size={10} /> : <CheckCircle2 size={10} />} {included ? 'EXCLUDE' : 'INCLUDE'}</button>}
                    {!record?.supersededByAssetId && <button onClick={() => review(asset.id, 'VERIFIED')} className="flex items-center gap-1 rounded border border-emerald-500/30 px-2 py-1 text-[9px] text-emerald-300 hover:bg-emerald-950/30"><ShieldCheck size={10} /> VERIFY 30D</button>}
                    {!record?.supersededByAssetId && <button onClick={() => review(asset.id, 'QUARANTINED')} className="flex items-center gap-1 rounded border border-amber-500/30 px-2 py-1 text-[9px] text-amber-300 hover:bg-amber-950/30"><ShieldAlert size={10} /> QUARANTINE</button>}
                  </div>
                </div>

                {!record?.supersededByAssetId && replacementOptions.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 border-t border-gray-800 pt-2">
                    <ArrowRightLeft size={11} className="text-violet-300" />
                    <span className="text-[9px] text-gray-500">SUPERSEDE WITH</span>
                    <select value={replacementByAsset[asset.id] ?? ''} onChange={(event) => setReplacementByAsset((current) => ({ ...current, [asset.id]: event.target.value }))} className="min-w-48 rounded border border-gray-700 bg-[#090e17] px-2 py-1 text-[9px] text-gray-300 outline-none">
                      <option value="">Select replacement source…</option>
                      {replacementOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                    </select>
                    <button disabled={!replacementByAsset[asset.id]} onClick={() => supersede(asset.id)} className="rounded border border-violet-500/30 px-2 py-1 text-[9px] text-violet-300 hover:bg-violet-950/30 disabled:cursor-not-allowed disabled:opacity-40">CONFIRM SUPERSESSION</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-gray-800 bg-[#090e17] p-3">
        <div className="mb-2 flex items-center gap-2 font-bold text-gray-300"><History size={13} /> PROVENANCE / REVIEW HISTORY</div>
        {history.length === 0 ? <div className="text-[10px] text-gray-600">No governance events recorded yet.</div> : (
          <div className="max-h-52 space-y-1.5 overflow-y-auto">
            {history.slice(0, 50).map((event) => {
              const asset = project.assets.find((item) => item.id === event.assetId);
              const replacement = event.replacementAssetId ? project.assets.find((item) => item.id === event.replacementAssetId) : undefined;
              return <div key={event.id} className="flex items-start justify-between rounded border border-gray-800 bg-[#111726] p-2 text-[9px]"><div><span className="font-bold text-cyan-300">{event.action}</span><span className="ml-2 text-gray-300">{asset?.name ?? event.assetId}</span>{event.priority && <span className="ml-2 text-violet-300">{event.priority}</span>}<div className="mt-0.5 text-gray-600">{event.note || `${event.actor} governance action`}{replacement ? ` · replacement ${replacement.name}` : event.replacementAssetId ? ` · replacement ${event.replacementAssetId}` : ''}</div></div><div className="flex shrink-0 items-center gap-1 text-gray-600"><Clock3 size={9} />{new Date(event.timestamp).toLocaleString()}</div></div>;
            })}
          </div>
        )}
        <div className="mt-2 text-[8px] text-gray-600">History is project provenance metadata, not a cryptographic or immutable audit ledger.</div>
      </div>
    </div>
  );
};
