import React, { useMemo, useState } from 'react';
import { CheckCircle2, GitCompareArrows, Link2, ShieldQuestion } from 'lucide-react';
import { KnowledgeGovernanceWorkflow } from '../../project/KnowledgeGovernanceWorkflow';
import { KnowledgeHealth } from '../../project/KnowledgeHealth';
import type { MioProject } from '../../types/project';

interface Props { project: MioProject; }

export const KnowledgeCorroborationPanel: React.FC<Props> = ({ project }) => {
  const [label, setLabel] = useState('Corroborated source group');
  const [selected, setSelected] = useState<string[]>([]);
  const [resolutionNote, setResolutionNote] = useState('Reviewed in Knowledge Governance Center');
  const activeDocuments = useMemo(() => project.assets.filter((asset) => asset.type === 'document' && project.knowledgeGovernance.sources[asset.id]?.included !== false && !project.knowledgeGovernance.sources[asset.id]?.supersededByAssetId), [project]);
  const health = useMemo(() => KnowledgeHealth.evaluate(project), [project]);
  const groups = project.knowledgeGovernance.corroborationGroups ?? [];

  const toggle = (assetId: string) => setSelected((current) => current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]);
  const createGroup = () => {
    const id = KnowledgeGovernanceWorkflow.createCorroborationGroup(label, selected);
    if (id) setSelected([]);
  };

  return (
    <div className="space-y-4 rounded-xl border border-violet-500/20 bg-[#0d121d] p-4">
      <div className="flex items-center justify-between">
        <div><div className="flex items-center gap-2 font-bold text-violet-300"><Link2 size={15} /> CORROBORATION & CONFLICT REVIEW</div><div className="mt-1 text-[10px] text-gray-500">Human-declared source grouping and explicit review of heuristic conflict signals.</div></div>
        <div className="flex gap-2 text-[9px]"><span className="rounded border border-violet-500/30 bg-violet-950/20 px-2 py-1 text-violet-300">EVIDENCE {health.evidenceStrength}</span><span className="rounded border border-cyan-500/30 bg-cyan-950/20 px-2 py-1 text-cyan-300">GROUPS {health.corroborationGroups}</span><span className="rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-amber-300">OPEN CONFLICTS {health.openConflicts}</span></div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-[#090e17] p-3">
        <div className="mb-2 font-bold text-gray-300">CREATE CORROBORATION GROUP</div>
        <div className="mb-2 flex gap-2"><input value={label} onChange={(event) => setLabel(event.target.value)} className="flex-1 rounded border border-gray-700 bg-black/30 px-3 py-2 text-[10px] text-gray-300 outline-none" /><button disabled={selected.length < 2 || label.trim().length < 2} onClick={createGroup} className="rounded border border-violet-500/30 px-3 py-1 text-[9px] text-violet-300 disabled:opacity-40">CREATE GROUP ({selected.length})</button></div>
        <div className="flex flex-wrap gap-2">{activeDocuments.map((asset) => <button key={asset.id} onClick={() => toggle(asset.id)} className={`flex items-center gap-1 rounded border px-2 py-1 text-[9px] ${selected.includes(asset.id) ? 'border-violet-500/40 bg-violet-950/30 text-violet-300' : 'border-gray-700 text-gray-500'}`}><CheckCircle2 size={9} /> {asset.name}</button>)}</div>
        <div className="mt-2 text-[8px] text-gray-600">A group records that the user considers these sources mutually corroborating for a shared topic. It does not prove their claims true or independent.</div>
      </div>

      {groups.length > 0 && <div className="rounded-lg border border-gray-800 bg-[#090e17] p-3"><div className="mb-2 font-bold text-gray-300">CORROBORATION GROUPS</div><div className="space-y-1.5">{groups.slice(-20).map((group) => <div key={group.id} className="rounded border border-gray-800 bg-[#111726] p-2 text-[9px]"><span className="font-bold text-violet-300">{group.label}</span><span className="ml-2 text-gray-500">{group.assetIds.map((id) => project.assets.find((asset) => asset.id === id)?.name ?? id).join(' · ')}</span></div>)}</div></div>}

      {health.potentialConflicts.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3">
        <div className="mb-2 flex items-center gap-2 font-bold text-amber-300"><GitCompareArrows size={13} /> CONFLICT REVIEW</div>
        <input value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} className="mb-2 w-full rounded border border-gray-700 bg-black/30 px-3 py-2 text-[10px] text-gray-300 outline-none" />
        <div className="space-y-2">{health.potentialConflicts.slice(0, 10).map((conflict) => {
          const left = project.assets.find((asset) => asset.id === conflict.leftAssetId);
          const right = project.assets.find((asset) => asset.id === conflict.rightAssetId);
          if (conflict.resolution) return <div key={conflict.conflictKey} className="rounded border border-emerald-500/20 bg-emerald-950/10 p-2 text-[9px]"><span className="font-bold text-emerald-300">REVIEWED · {conflict.resolution.status}</span><span className="ml-2 text-gray-400">{left?.name} ↔ {right?.name}</span>{conflict.resolution.preferredAssetId && <div className="mt-1 text-gray-500">Preferred: {project.assets.find((asset) => asset.id === conflict.resolution?.preferredAssetId)?.name ?? conflict.resolution.preferredAssetId}</div>}</div>;
          const pair = [conflict.leftAssetId, conflict.rightAssetId];
          return <div key={conflict.conflictKey} className="rounded border border-amber-500/20 bg-[#111726] p-2 text-[9px]"><div className="flex items-center gap-1 font-bold text-amber-300"><ShieldQuestion size={10} /> {conflict.reason}</div><div className="mt-1 text-gray-300">{left?.name} ↔ {right?.name}</div><div className="mt-2 flex flex-wrap gap-1.5"><button onClick={() => KnowledgeGovernanceWorkflow.reviewConflict(conflict.conflictKey, pair, 'ACCEPTED_VARIANCE', resolutionNote)} className="rounded border border-gray-700 px-2 py-1 text-gray-300">ACCEPT VARIANCE</button><button onClick={() => KnowledgeGovernanceWorkflow.reviewConflict(conflict.conflictKey, pair, 'PREFER_SOURCE', resolutionNote, conflict.leftAssetId)} className="rounded border border-cyan-500/30 px-2 py-1 text-cyan-300">PREFER {left?.name ?? 'LEFT'}</button><button onClick={() => KnowledgeGovernanceWorkflow.reviewConflict(conflict.conflictKey, pair, 'PREFER_SOURCE', resolutionNote, conflict.rightAssetId)} className="rounded border border-cyan-500/30 px-2 py-1 text-cyan-300">PREFER {right?.name ?? 'RIGHT'}</button></div></div>;
        })}</div>
        <div className="mt-2 text-[8px] text-gray-600">Review status records a human governance decision. It does not rewrite source content or convert MIO's heuristic into factual adjudication.</div>
      </div>}
    </div>
  );
};
