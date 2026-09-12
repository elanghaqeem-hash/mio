import React, { useMemo, useState } from 'react';
import { AlertTriangle, Database, ExternalLink, FileText, Globe2, Search, ShieldAlert } from 'lucide-react';
import { ResearchEngine } from '../../research/ResearchEngine';
import { ResearchKnowledgePromotion } from '../../research/ResearchKnowledgePromotion';
import { ResearchReport } from '../../types/research';

export const ResearchStudioView: React.FC = () => {
  const engine = useMemo(() => new ResearchEngine(), []);
  const [query, setQuery] = useState('');
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promotionState, setPromotionState] = useState<Record<string, string>>({});

  const handleSearch = async () => {
    if (!query.trim() || isSearching) return;
    setIsSearching(true);
    setError(null);
    setPromotionState({});
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
    if (result.status === 'PROMOTED') setPromotionState((current) => ({ ...current, [sourceId]: 'PROMOTED · PROJECT TRUST = QUARANTINED' }));
    else if (result.status === 'ALREADY_PROMOTED') setPromotionState((current) => ({ ...current, [sourceId]: 'ALREADY PROMOTED · GOVERNED IN PROJECT' }));
    else setPromotionState((current) => ({ ...current, [sourceId]: 'PROMOTION FAILED · SOURCE NOT FOUND' }));
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden p-4">
      <div className="flex items-center justify-between mb-4 bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 text-cyan-300">
          <Globe2 size={16} />
          <span className="font-bold text-sm">MIO RESEARCH ENGINE // SOURCE-AWARE ONLINE INTELLIGENCE</span>
        </div>
        <span className="text-gray-500 text-[10px]">EXTERNAL CONTENT = UNTRUSTED DATA</span>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-[#0d121d] border border-gray-700 focus-within:border-cyan-400 rounded-lg px-3 py-2">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
            placeholder="Search documentation, papers, standards, protocols, concepts..."
            className="flex-1 bg-transparent text-white text-xs outline-none"
          />
        </div>
        <button
          onClick={() => void handleSearch()}
          disabled={isSearching || !query.trim()}
          className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-bold rounded-lg cursor-pointer transition shadow-md shadow-cyan-500/20"
        >
          {isSearching ? 'RESEARCHING...' : 'RESEARCH'}
        </button>
      </div>

      <div className="grid grid-cols-6 gap-2 mb-4 text-[10px] text-center">
        {['PLAN', 'SEARCH', 'SANITIZE', 'ASSESS', 'CONFLICT', 'CITE'].map((stage, index) => (
          <div key={stage} className="bg-[#111726] p-2 rounded border border-gray-800 text-cyan-400 font-bold">
            {index + 1}. {stage}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-950/20 text-red-300">{error}</div>
      )}

      {report && (
        <div className="mb-3 grid grid-cols-4 gap-2 text-[10px]">
          <div className="bg-[#0d121d] border border-gray-800 rounded-lg p-2">Sources <span className="text-cyan-300 font-bold">{report.sources.length}</span></div>
          <div className="bg-[#0d121d] border border-gray-800 rounded-lg p-2">Conflicts <span className="text-amber-300 font-bold">{report.conflicts.length}</span></div>
          <div className="bg-[#0d121d] border border-gray-800 rounded-lg p-2">Provider errors <span className="text-red-300 font-bold">{report.providerErrors.length}</span></div>
          <div className="bg-[#0d121d] border border-gray-800 rounded-lg p-2">Intent <span className="text-violet-300 font-bold">{report.query.intents.join(' / ')}</span></div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3">
        {report?.conflicts.map((conflict) => (
          <div key={conflict.id} className="bg-amber-950/20 border border-amber-500/30 p-3 rounded-xl text-amber-200 flex gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{conflict.description}</span>
          </div>
        ))}

        {report?.sources.map((source) => {
          const preview = ResearchKnowledgePromotion.preview(source, report);
          return (
            <article key={source.id} className="bg-[#0d121d] border border-gray-800 p-4 rounded-xl space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-cyan-300 font-bold text-sm flex items-center gap-2">
                    <FileText size={14} /> {source.title}
                  </div>
                  <div className="mt-1 text-[10px] text-gray-500">{source.citationLabel} // {source.provider.toUpperCase()}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${source.status === 'CORROBORATED' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30' : 'bg-amber-950/40 text-amber-400 border-amber-500/30'}`}>
                  [{source.status}]
                </span>
              </div>

              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{source.sanitizedExcerpt}</p>

              <div className="rounded border border-amber-500/20 bg-amber-950/10 p-2 text-[9px]">
                <div className="flex items-center gap-1.5 font-bold text-amber-300"><ShieldAlert size={10} /> PROJECT PROMOTION PREVIEW · TRUST {preview.initialTrust} · FRESHNESS {preview.initialFreshness}</div>
                <div className="mt-1 text-gray-500">{preview.advisory} · {preview.advisoryReason}</div>
                {preview.suspicious && <div className="mt-1 text-rose-300">Suspicious external content remains sanitized and quarantined. Threat signals: {preview.detectedThreats.join(', ') || 'detected by policy engine'}.</div>}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-800/80 text-gray-500 text-[10px] gap-4">
                <a href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 truncate">
                  <ExternalLink size={11} /> {source.url}
                </a>
                <span className="shrink-0">Reliability: {source.reliability} ({Math.round(source.reliabilityScore * 100)}%)</span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[9px] text-gray-600">Promotion is an explicit project-governance action and does not write Long-Term Memory.</span>
                <div className="flex items-center gap-2">
                  {promotionState[source.id] && <span className="text-[9px] font-bold text-cyan-300">{promotionState[source.id]}</span>}
                  <button onClick={() => promote(source.id)} className="flex items-center gap-1.5 rounded border border-cyan-500/30 px-2.5 py-1.5 text-[9px] font-bold text-cyan-300 hover:bg-cyan-950/30"><Database size={11} /> PROMOTE TO PROJECT</button>
                </div>
              </div>
            </article>
          );
        })}

        {!report && !isSearching && (
          <div className="h-full flex items-center justify-center text-gray-600 text-center">
            Research results will appear here with source reliability, epistemic status, conflicts, citations, and governed project-promotion controls.
          </div>
        )}
      </div>
    </div>
  );
};
