import React, { useMemo, useState } from 'react';
import { AlertTriangle, Database, ExternalLink, FileText, GitCompareArrows, Globe2, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { ResearchEngine } from '../../research/ResearchEngine';
import { ResearchKnowledgePromotion } from '../../research/ResearchKnowledgePromotion';
import { ResearchRevalidation, type RevalidationComparison, type RevalidationDecision, type RevalidationQueueItem } from '../../research/ResearchRevalidation';
import { ResearchReport } from '../../types/research';

export const ResearchStudioView: React.FC = () => {
  const engine = useMemo(() => new ResearchEngine(), []);
  const [query, setQuery] = useState('');
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promotionState, setPromotionState] = useState<Record<string, string>>({});
  const [revalidationQueue, setRevalidationQueue] = useState<RevalidationQueueItem[]>(() => ResearchRevalidation.queue());
  const [activeRevalidationAssetId, setActiveRevalidationAssetId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<RevalidationComparison | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<string | null>(null);

  const activeQueueItem = activeRevalidationAssetId ? revalidationQueue.find((item) => item.assetId === activeRevalidationAssetId) : undefined;

  const handleSearch = async () => {
    if (!query.trim() || isSearching) return;
    setIsSearching(true);
    setError(null);
    setPromotionState({});
    setComparison(null);
    setDecisionStatus(null);
    try {
      setReport(await engine.research(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const promote = (sourceId: string) => {
    if (!report) return;
    const result = ResearchKnowledgePromotion.promote(report, sourceId);
    if (result.status === 'PROMOTED') {
      setPromotionState((current) => ({ ...current, [sourceId]: 'PROMOTED · PROJECT TRUST = QUARANTINED' }));
      setRevalidationQueue(ResearchRevalidation.queue());
    } else if (result.status === 'ALREADY_PROMOTED') setPromotionState((current) => ({ ...current, [sourceId]: 'ALREADY PROMOTED · GOVERNED IN PROJECT' }));
    else setPromotionState((current) => ({ ...current, [sourceId]: 'PROMOTION FAILED · SOURCE NOT FOUND' }));
  };

  const startRevalidation = (item: RevalidationQueueItem) => {
    setActiveRevalidationAssetId(item.assetId);
    setComparison(null);
    setDecisionStatus(null);
    setReport(null);
    setQuery(item.sourceUrl || 'latest source update');
    setError('REVALIDATION READY · Run RESEARCH explicitly. No background refresh has been performed.');
  };

  const compareCandidate = (sourceId: string) => {
    if (!report || !activeRevalidationAssetId) return;
    const result = ResearchRevalidation.compare(activeRevalidationAssetId, report, sourceId);
    if (!result) {
      setError('REVALIDATION COMPARISON FAILED · Governed source or selected research candidate was not found.');
      return;
    }
    setComparison(result);
    setDecisionStatus(null);
    setError(null);
  };

  const applyDecision = (decision: RevalidationDecision) => {
    if (!report || !activeRevalidationAssetId || !comparison) return;
    if (decision === 'SUPERSEDE' && !window.confirm('Supersede the current governed source with this quarantined refresh candidate? The old source will be excluded from active retrieval.')) return;
    const result = ResearchRevalidation.apply(activeRevalidationAssetId, report, comparison.sourceId, decision);
    if (result.status !== 'APPLIED') {
      setDecisionStatus(`DECISION FAILED · ${result.status}`);
      return;
    }
    const replacementNote = result.replacementAsset ? ` · NEW ASSET ${result.replacementAsset.name}` : '';
    setDecisionStatus(`${decision} APPLIED${replacementNote} · TRUST REMAINS GOVERNED`);
    setRevalidationQueue(ResearchRevalidation.queue());
    setComparison(null);
    setActiveRevalidationAssetId(null);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#07090e] p-4 font-mono text-xs">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-800 bg-[#0d121d] p-3">
        <div className="flex items-center gap-2 text-cyan-300">
          <Globe2 size={16} />
          <span className="text-sm font-bold">MIO RESEARCH ENGINE // SOURCE-AWARE ONLINE INTELLIGENCE</span>
        </div>
        <span className="text-[10px] text-gray-500">EXTERNAL CONTENT = UNTRUSTED DATA</span>
      </div>

      {revalidationQueue.length > 0 && (
        <div className="mb-4 rounded-xl border border-violet-500/30 bg-violet-950/10 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-violet-300"><RefreshCw size={13} /> SOURCE REVALIDATION QUEUE ({revalidationQueue.length})</div>
            <span className="text-[9px] text-gray-500">ADVISORY ONLY · USER-INITIATED REFRESH REQUIRED</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {revalidationQueue.slice(0, 6).map((item) => (
              <div key={item.assetId} className={`rounded border p-2 ${activeRevalidationAssetId === item.assetId ? 'border-violet-500/50 bg-violet-950/20' : 'border-gray-800 bg-[#111726]'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-gray-200">{item.assetName}</div>
                    <div className="mt-1 truncate text-[9px] text-gray-500">{item.sourceUrl}</div>
                  </div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${item.priority === 'CRITICAL' ? 'border-rose-500/30 text-rose-300' : item.priority === 'HIGH' ? 'border-amber-500/30 text-amber-300' : 'border-gray-700 text-gray-400'}`}>{item.priority}</span>
                </div>
                <div className="mt-2 text-[9px] text-gray-400">Freshness {item.freshness} · {item.advisory}</div>
                <div className="mt-1 text-[9px] text-gray-600">{item.reason}</div>
                <button onClick={() => startRevalidation(item)} className="mt-2 flex items-center gap-1 rounded border border-violet-500/30 px-2 py-1 text-[9px] font-bold text-violet-300 hover:bg-violet-950/30"><RefreshCw size={10} /> PREPARE CONTROLLED REFRESH</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-700 bg-[#0d121d] px-3 py-2 focus-within:border-cyan-400">
          <Search size={16} className="text-gray-400" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void handleSearch()} placeholder="Search documentation, papers, standards, protocols, concepts..." className="flex-1 bg-transparent text-xs text-white outline-none" />
        </div>
        <button onClick={() => void handleSearch()} disabled={isSearching || !query.trim()} className="cursor-pointer rounded-lg bg-cyan-500 px-5 py-2 font-bold text-black shadow-md shadow-cyan-500/20 transition hover:bg-cyan-400 disabled:opacity-40">{isSearching ? 'RESEARCHING...' : activeRevalidationAssetId ? 'RUN CONTROLLED REFRESH' : 'RESEARCH'}</button>
      </div>

      <div className="mb-4 grid grid-cols-6 gap-2 text-center text-[10px]">
        {['PLAN', 'SEARCH', 'SANITIZE', 'ASSESS', 'CONFLICT', 'CITE'].map((stage, index) => <div key={stage} className="rounded border border-gray-800 bg-[#111726] p-2 font-bold text-cyan-400">{index + 1}. {stage}</div>)}
      </div>

      {activeQueueItem && <div className="mb-3 rounded-lg border border-violet-500/30 bg-violet-950/15 p-2 text-[10px] text-violet-200"><b>CONTROLLED REFRESH TARGET:</b> {activeQueueItem.assetName} · candidate results below are not applied until you compare and choose a governance decision.</div>}
      {error && <div className={`mb-4 rounded-lg border p-3 ${error.startsWith('REVALIDATION READY') ? 'border-violet-500/30 bg-violet-950/20 text-violet-300' : 'border-red-500/30 bg-red-950/20 text-red-300'}`}>{error}</div>}
      {decisionStatus && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-emerald-300">{decisionStatus}</div>}

      {comparison && (
        <div className="mb-4 rounded-xl border border-violet-500/40 bg-[#0d121d] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-bold text-violet-300"><GitCompareArrows size={14} /> REVALIDATION REVIEW WORKBENCH</div>
            <div className="text-[9px] text-gray-500">METHOD {comparison.method} · CANDIDATE TRUST {comparison.candidateTrust} · FRESHNESS {comparison.candidateFreshness}</div>
          </div>
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <div className="rounded border border-gray-800 bg-[#111726] p-3"><div className="mb-2 text-[9px] font-bold text-gray-400">CURRENT GOVERNED SOURCE</div><div className="max-h-28 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-gray-300">{comparison.oldContent.slice(0, 900)}</div></div>
            <div className="rounded border border-violet-500/20 bg-violet-950/10 p-3"><div className="mb-2 text-[9px] font-bold text-violet-300">REFRESH CANDIDATE · UNTRUSTED DATA</div><div className="max-h-28 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-gray-300">{comparison.candidateContent.slice(0, 900)}</div></div>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2 text-[9px]">
            <div className="rounded border border-gray-800 bg-[#111726] p-2">Content changed <b className={comparison.contentChanged ? 'text-amber-300' : 'text-emerald-300'}>{comparison.contentChanged ? 'YES' : 'NO'}</b></div>
            <div className="rounded border border-gray-800 bg-[#111726] p-2">Lexical similarity <b className="text-cyan-300">{Math.round(comparison.similarity * 100)}%</b></div>
            <div className="rounded border border-gray-800 bg-[#111726] p-2">Metadata changes <b className="text-cyan-300">{comparison.metadataChanges.length ? comparison.metadataChanges.join(', ') : 'NONE'}</b></div>
          </div>
          {comparison.suspicious && <div className="mb-3 rounded border border-rose-500/30 bg-rose-950/20 p-2 text-[9px] text-rose-300">Suspicious candidate detected and sanitized. Threat signals: {comparison.detectedThreats.join(', ') || 'policy-engine detection'}.</div>}
          <div className="mb-2 text-[9px] text-gray-500">Similarity is lexical overlap only. It is not semantic equivalence, factual agreement, or verification.</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <button onClick={() => applyDecision('KEEP_EXISTING')} className="rounded border border-gray-700 px-2 py-2 text-[9px] font-bold text-gray-300 hover:bg-gray-800">KEEP EXISTING</button>
            <button onClick={() => applyDecision('UPDATE_METADATA')} className="rounded border border-cyan-500/30 px-2 py-2 text-[9px] font-bold text-cyan-300 hover:bg-cyan-950/20">UPDATE METADATA</button>
            <button onClick={() => applyDecision('ACCEPT_VARIANCE')} className="rounded border border-amber-500/30 px-2 py-2 text-[9px] font-bold text-amber-300 hover:bg-amber-950/20">ACCEPT VARIANCE</button>
            <button onClick={() => applyDecision('SUPERSEDE')} className="rounded border border-rose-500/30 px-2 py-2 text-[9px] font-bold text-rose-300 hover:bg-rose-950/20">SUPERSEDE</button>
          </div>
        </div>
      )}

      {report && <div className="mb-3 grid grid-cols-4 gap-2 text-[10px]"><div className="rounded-lg border border-gray-800 bg-[#0d121d] p-2">Sources <span className="font-bold text-cyan-300">{report.sources.length}</span></div><div className="rounded-lg border border-gray-800 bg-[#0d121d] p-2">Conflicts <span className="font-bold text-amber-300">{report.conflicts.length}</span></div><div className="rounded-lg border border-gray-800 bg-[#0d121d] p-2">Provider errors <span className="font-bold text-red-300">{report.providerErrors.length}</span></div><div className="rounded-lg border border-gray-800 bg-[#0d121d] p-2">Intent <span className="font-bold text-violet-300">{report.query.intents.join(' / ')}</span></div></div>}

      <div className="flex-1 space-y-3 overflow-y-auto">
        {report?.conflicts.map((conflict) => <div key={conflict.id} className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>{conflict.description}</span></div>)}
        {report?.sources.map((source) => {
          const preview = ResearchKnowledgePromotion.preview(source, report);
          return (
            <article key={source.id} className={`space-y-2 rounded-xl border bg-[#0d121d] p-4 ${comparison?.sourceId === source.id ? 'border-violet-500/50' : 'border-gray-800'}`}>
              <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-bold text-cyan-300"><FileText size={14} /> {source.title}</div><div className="mt-1 text-[10px] text-gray-500">{source.citationLabel} // {source.provider.toUpperCase()}</div></div><span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${source.status === 'CORROBORATED' ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-400' : 'border-amber-500/30 bg-amber-950/40 text-amber-400'}`}>[{source.status}]</span></div>
              <p className="whitespace-pre-wrap leading-relaxed text-gray-300">{source.sanitizedExcerpt}</p>
              <div className="rounded border border-amber-500/20 bg-amber-950/10 p-2 text-[9px]"><div className="flex items-center gap-1.5 font-bold text-amber-300"><ShieldAlert size={10} /> PROJECT PROMOTION PREVIEW · TRUST {preview.initialTrust} · FRESHNESS {preview.initialFreshness}</div><div className="mt-1 text-gray-500">{preview.advisory} · {preview.advisoryReason}</div>{preview.suspicious && <div className="mt-1 text-rose-300">Suspicious external content remains sanitized and quarantined. Threat signals: {preview.detectedThreats.join(', ') || 'detected by policy engine'}.</div>}</div>
              <div className="flex items-center justify-between gap-4 border-t border-gray-800/80 pt-2 text-[10px] text-gray-500"><a href={source.url} target="_blank" rel="noreferrer" className="flex truncate items-center gap-1 text-cyan-400 hover:text-cyan-300"><ExternalLink size={11} /> {source.url}</a><span className="shrink-0">Reliability: {source.reliability} ({Math.round(source.reliabilityScore * 100)}%)</span></div>
              <div className="flex items-center justify-between pt-1"><span className="text-[9px] text-gray-600">External research remains untrusted data until governed separately.</span><div className="flex items-center gap-2">{promotionState[source.id] && <span className="text-[9px] font-bold text-cyan-300">{promotionState[source.id]}</span>}{activeRevalidationAssetId ? <button onClick={() => compareCandidate(source.id)} className="flex items-center gap-1.5 rounded border border-violet-500/30 px-2.5 py-1.5 text-[9px] font-bold text-violet-300 hover:bg-violet-950/30"><GitCompareArrows size={11} /> COMPARE REFRESH CANDIDATE</button> : <button onClick={() => promote(source.id)} className="flex items-center gap-1.5 rounded border border-cyan-500/30 px-2.5 py-1.5 text-[9px] font-bold text-cyan-300 hover:bg-cyan-950/30"><Database size={11} /> PROMOTE TO PROJECT</button>}</div></div>
            </article>
          );
        })}
        {!report && !isSearching && <div className="flex h-full items-center justify-center text-center text-gray-600">Research results will appear here with source reliability, epistemic status, conflicts, governed promotion, and explicit revalidation controls.</div>}
      </div>
    </div>
  );
};
