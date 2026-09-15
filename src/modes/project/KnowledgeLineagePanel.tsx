import React, { useMemo, useState } from 'react';
import { GitBranch, Search, ShieldQuestion } from 'lucide-react';
import { KnowledgeLineage } from '../../project/KnowledgeLineage';
import { ProjectKnowledgeIndex } from '../../project/ProjectKnowledgeIndex';
import { KnowledgeQueryDiagnostics } from '../../project/KnowledgeQueryDiagnostics';
import type { MioProject } from '../../types/project';

interface Props { project: MioProject; }

export const KnowledgeLineagePanel: React.FC<Props> = ({ project }) => {
  const documents = useMemo(() => project.assets.filter((asset) => asset.type === 'document' && !project.knowledgeGovernance.sources[asset.id]?.supersededByAssetId), [project]);
  const [upstreamByAsset, setUpstreamByAsset] = useState<Record<string, string>>({});
  const [parentByAsset, setParentByAsset] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [diagnosticQuery, setDiagnosticQuery] = useState('');

  const diagnostics = useMemo(() => {
    if (!diagnosticQuery.trim()) return null;
    const context = ProjectKnowledgeIndex.retrieve(project, diagnosticQuery, { limit: 5 });
    return KnowledgeQueryDiagnostics.evaluate(project, context);
  }, [project, diagnosticQuery]);

  const saveLineage = (assetId: string) => {
    const current = project.knowledgeGovernance.sources[assetId]?.lineage;
    const upstream = upstreamByAsset[assetId] ?? current?.upstreamSourceKey ?? '';
    const selectedParent = parentByAsset[assetId] ?? current?.derivedFromAssetIds?.[0] ?? '';
    KnowledgeLineage.update(assetId, {
      upstreamSourceKey: upstream || undefined,
      derivedFromAssetIds: selectedParent ? [selectedParent] : [],
      note: 'Reviewed in Source Lineage Center',
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-cyan-500/20 bg-[#0d121d] p-4">
      <div className="flex items-center justify-between">
        <div><div className="flex items-center gap-2 font-bold text-cyan-300"><GitBranch size={15} /> SOURCE LINEAGE & QUERY DIAGNOSTICS</div><div className="mt-1 text-[10px] text-gray-500">Explicit upstream/dependency metadata and transparent query-specific retrieval diagnostics.</div></div>
        <span className="rounded border border-cyan-500/20 bg-cyan-950/20 px-2 py-1 text-[9px] text-cyan-300">EXPLICIT METADATA ONLY</span>
      </div>

      <div className="space-y-2 rounded-lg border border-gray-800 bg-[#090e17] p-3">
        {documents.length === 0 && <div className="text-[10px] text-gray-600">No document sources available for lineage review.</div>}
        {documents.map((asset) => {
          const lineage = KnowledgeLineage.inspect(project, asset.id);
          const currentParent = parentByAsset[asset.id] ?? lineage.derivedFromAssetIds[0] ?? '';
          return <div key={asset.id} className="grid grid-cols-[1.2fr_1fr_1fr_auto] items-center gap-2 rounded border border-gray-800 bg-[#111726] p-2 text-[9px]">
            <div className="min-w-0"><div className="truncate font-bold text-gray-200">{asset.name}</div><div className="mt-0.5 truncate text-gray-600">{lineage.familyKeys.join(' · ')}</div></div>
            <input value={upstreamByAsset[asset.id] ?? lineage.upstreamSourceKey ?? ''} onChange={(event) => setUpstreamByAsset((current) => ({ ...current, [asset.id]: event.target.value }))} placeholder="upstream source key" className="rounded border border-gray-700 bg-black/30 px-2 py-1.5 text-gray-300 outline-none" />
            <select value={currentParent} onChange={(event) => setParentByAsset((current) => ({ ...current, [asset.id]: event.target.value }))} className="rounded border border-gray-700 bg-[#090e17] px-2 py-1.5 text-gray-300 outline-none">
              <option value="">No direct parent</option>
              {documents.filter((candidate) => candidate.id !== asset.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
            <button onClick={() => saveLineage(asset.id)} className="rounded border border-cyan-500/30 px-2 py-1.5 font-bold text-cyan-300 hover:bg-cyan-950/20">SAVE</button>
          </div>;
        })}
        <div className="text-[8px] text-gray-600">MIO does not infer upstream identity automatically. Invalid self-links, unknown documents, and dependency cycles are rejected by the lineage workflow.</div>
      </div>

      <div className="rounded-lg border border-violet-500/20 bg-violet-950/10 p-3">
        <div className="mb-2 flex items-center gap-2 font-bold text-violet-300"><Search size={13} /> QUERY-SPECIFIC DIAGNOSTICS</div>
        <div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setDiagnosticQuery(query.trim()); }} placeholder="Enter a project knowledge query…" className="flex-1 rounded border border-gray-700 bg-black/30 px-3 py-2 text-[10px] text-gray-300 outline-none" /><button disabled={!query.trim()} onClick={() => setDiagnosticQuery(query.trim())} className="rounded border border-violet-500/30 px-3 py-1 text-[9px] font-bold text-violet-300 disabled:opacity-40">ANALYZE</button></div>
        {diagnostics && <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-[9px]"><span className="rounded border border-gray-700 bg-[#111726] px-2 py-1 text-gray-300">SELECTED {diagnostics.selectedSourceCount}</span><span className="rounded border border-cyan-500/20 bg-cyan-950/20 px-2 py-1 text-cyan-300">LINEAGES {diagnostics.independentLineageCount}</span><span className="rounded border border-violet-500/20 bg-violet-950/20 px-2 py-1 text-violet-300">{diagnostics.lineageDiversity}</span><span className="rounded border border-gray-700 bg-[#111726] px-2 py-1 text-gray-500">{diagnostics.method}</span></div>
          {diagnostics.sources.length === 0 ? <div className="rounded border border-dashed border-gray-800 p-3 text-[9px] text-gray-600">No project source matched this query. Governance metadata did not manufacture relevance.</div> : diagnostics.sources.map((source) => <div key={`${source.assetId}-${source.finalScore}`} className="rounded border border-gray-800 bg-[#111726] p-2 text-[9px]"><div className="flex items-center justify-between"><span className="font-bold text-gray-200">{source.assetName}</span><span className="text-cyan-300">score {source.finalScore.toFixed(2)}</span></div><div className="mt-1 text-gray-500">{source.explanation.join(' · ')}</div><div className="mt-1 flex items-center gap-1 text-gray-600"><ShieldQuestion size={9} /> lineage: {source.lineageFamilyKeys.join(', ')}{source.sameLineageAsSelectedPeer ? ' · overlaps selected peer' : ''}</div></div>)}
        </div>}
        <div className="mt-2 text-[8px] text-gray-600">Scores explain retrieval ranking only; they are not factual confidence, truth probability, or semantic entailment.</div>
      </div>
    </div>
  );
};
