import React, { useState } from 'react';
import { Search, Globe, AlertCircle, FileText, ExternalLink, Loader2 } from 'lucide-react';
import { EpistemicStatus } from '../../agents/AntiHallucination';
import { PolicyEngine } from '../../security/PolicyEngine';
import { ModelRouter } from '../../agents/ModelRouter';

interface SearchSource {
  title: string;
  url: string;
  reliability: 'HIGH' | 'MODERATE' | 'UNVERIFIED';
  status: EpistemicStatus;
  summary: string;
  provider?: string;
  publishedAt?: string | null;
}

interface ResearchResponse {
  query: string;
  provider: string;
  fullWeb: boolean;
  warning: string;
  fetchedAt: string;
  results: SearchSource[];
}

export const ResearchStudioView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchSource[]>([]);
  const [notice, setNotice] = useState('Enable ONLINE mode to use the live Cloudflare research connector. Search retrieval is never treated as automatic factual verification.');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('NOT CONNECTED');

  const resolveResearchEndpoint = async () => {
    if (window.location.protocol !== 'file:') return '/api/research';
    const base = await window.mioDesktop?.getSetting('research.webEndpoint', '');
    if (typeof base !== 'string' || !/^https:\/\//i.test(base.trim())) {
      throw new Error('Desktop live research requires a deployed HTTPS MIO endpoint. Set research.webEndpoint to the Cloudflare Pages URL.');
    }
    return `${base.replace(/\/$/, '')}/api/research`;
  };

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    if (ModelRouter.isOffline()) {
      setResults([]);
      setProvider('OFFLINE');
      setNotice('Offline mode: no external request was sent. Switch to ONLINE mode for live research.');
      return;
    }

    const { sanitized, suspicious } = PolicyEngine.sanitizeExternalContent(trimmed, 'research_query');
    if (suspicious || !sanitized.trim()) {
      setResults([]);
      setProvider('BLOCKED');
      setNotice('The query was blocked by the untrusted-content policy scanner. No search request was sent.');
      return;
    }

    setLoading(true);
    setNotice('Searching live sources…');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const endpoint = await resolveResearchEndpoint();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: sanitized, count: 8 }),
        credentials: 'same-origin',
        redirect: 'error',
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({})) as Partial<ResearchResponse> & { error?: string };
      if (!response.ok) throw new Error(data.error || `Research connector returned HTTP ${response.status}`);
      const safeResults = Array.isArray(data.results) ? data.results.filter((item) => item && typeof item.title === 'string' && /^https?:\/\//i.test(item.url)) : [];
      setResults(safeResults);
      setProvider(data.provider === 'brave-search' ? 'BRAVE SEARCH // LIVE WEB' : 'WIKIPEDIA + CROSSREF // LIVE PUBLIC');
      setNotice(`${data.warning || 'Live retrieval completed.'} ${safeResults.length} source(s) returned at ${data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : 'current time'}.`);
    } catch (error) {
      setResults([]);
      setProvider('ERROR');
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'Research request timed out after 20 seconds.'
        : error instanceof Error ? error.message : 'Research connector failed.';
      setNotice(`Live research failed: ${message}`);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden p-4">
      <div className="flex items-center justify-between mb-4 bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 text-cyan-300">
          <Globe size={16} />
          <span className="font-bold text-sm">RESEARCH WORKSPACE // LIVE SOURCE RETRIEVAL</span>
        </div>
        <div className="text-right">
          <div className="text-gray-500 text-[9px]">CONNECTOR</div>
          <div className="text-emerald-400 text-[10px] font-bold">{provider}</div>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 bg-[#0d121d] border border-gray-700 focus-within:border-cyan-400 rounded-lg px-3 py-2">
          <Search size={16} className="text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
            placeholder="Enter a research question…"
            maxLength={500}
            className="flex-1 bg-transparent text-white text-xs outline-none"
          />
        </div>
        <button disabled={loading} onClick={() => void handleSearch()} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold rounded-lg cursor-pointer transition flex items-center gap-2">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? 'SEARCHING' : 'LIVE SEARCH'}
        </button>
      </div>

      <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-950/20 text-amber-300 flex items-start gap-2">
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <span>{notice}</span>
      </div>

      <div className="grid grid-cols-5 gap-2 mb-4 text-[10px] text-center">
        {['1. QUERY','2. LIVE SOURCE','3. RELIABILITY','4. CONFLICT','5. EVIDENCE'].map((item) => <div key={item} className="bg-[#111726] p-2 rounded border border-gray-800 text-cyan-400 font-bold">{item}</div>)}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {results.length === 0 && !loading && <div className="h-full flex items-center justify-center text-gray-600">No live sources loaded yet.</div>}
        {results.map((res, i) => (
          <div key={`${res.url}-${i}`} className="bg-[#0d121d] border border-gray-800 p-4 rounded-xl space-y-2">
            <div className="flex items-start justify-between gap-3">
              <a href={res.url} target="_blank" rel="noreferrer noopener" className="text-cyan-300 hover:text-cyan-200 font-bold text-sm flex items-center gap-2 min-w-0">
                <FileText size={14} className="shrink-0" />
                <span className="truncate">{res.title}</span>
                <ExternalLink size={11} className="shrink-0" />
              </a>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-950/40 text-amber-400 border-amber-500/30 shrink-0">[{res.status}]</span>
            </div>
            <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{res.summary || 'No snippet was provided by the search source.'}</p>
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-800/80 text-gray-500 text-[10px]">
              <span className="truncate">Provider: {res.provider || provider}{res.publishedAt ? ` · ${res.publishedAt}` : ''}</span>
              <span className="shrink-0">Retrieval reliability: {res.reliability}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
