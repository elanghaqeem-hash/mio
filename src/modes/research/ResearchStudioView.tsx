import React, { useState } from 'react';
import { Search, Globe, ShieldCheck, AlertCircle, FileText } from 'lucide-react';
import { EpistemicStatus } from '../../agents/AntiHallucination';
import { PolicyEngine } from '../../security/PolicyEngine';
import { ModelRouter } from '../../agents/ModelRouter';

interface SearchSource {
  title: string;
  url: string;
  reliability: 'HIGH' | 'MODERATE' | 'UNVERIFIED';
  status: EpistemicStatus;
  summary: string;
}

export const ResearchStudioView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchSource[]>([]);
  const [notice, setNotice] = useState('Research mode is local-only until a real provider/search connector is configured.');

  const handleSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    if (ModelRouter.isOffline()) {
      setResults([]);
      setNotice('Offline mode: no external search was performed. MIO will not fabricate sources or mark simulated content as verified.');
      return;
    }

    const { sanitized, suspicious } = PolicyEngine.sanitizeExternalContent(trimmed, 'research_query');
    setResults([
      {
        title: 'External research provider not yet connected',
        url: '',
        reliability: 'UNVERIFIED',
        status: 'UNKNOWN',
        summary: suspicious
          ? 'The query triggered the untrusted-content policy scanner. No external request was sent.'
          : `Query accepted safely: ${sanitized}. Configure a supported online provider/connector before relying on live research results.`,
      },
    ]);
    setNotice('Online mode is enabled, but this build has no live search transport. Results remain UNKNOWN until a provider is implemented.');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden p-4">
      <div className="flex items-center justify-between mb-4 bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 text-cyan-300">
          <Globe size={16} />
          <span className="font-bold text-sm">RESEARCH WORKSPACE // SOURCE-INTEGRITY FIRST</span>
        </div>
        <span className="text-gray-500 text-[10px]">NO FABRICATED VERIFICATION</span>
      </div>

      <div className="flex gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 bg-[#0d121d] border border-gray-700 focus-within:border-cyan-400 rounded-lg px-3 py-2">
          <Search size={16} className="text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="Enter a research question..." className="flex-1 bg-transparent text-white text-xs outline-none" />
        </div>
        <button onClick={handleSearch} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg cursor-pointer transition">CHECK / SEARCH</button>
      </div>

      <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-950/20 text-amber-300 flex items-start gap-2">
        <AlertCircle size={14} className="mt-0.5" />
        <span>{notice}</span>
      </div>

      <div className="grid grid-cols-5 gap-2 mb-4 text-[10px] text-center">
        {['1. QUERY','2. SOURCE','3. RELIABILITY','4. CONFLICT','5. EVIDENCE'].map((item) => <div key={item} className="bg-[#111726] p-2 rounded border border-gray-800 text-cyan-400 font-bold">{item}</div>)}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {results.length === 0 && <div className="h-full flex items-center justify-center text-gray-600">No verified external sources loaded.</div>}
        {results.map((res, i) => (
          <div key={i} className="bg-[#0d121d] border border-gray-800 p-4 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-cyan-300 font-bold text-sm flex items-center gap-2"><FileText size={14} /> {res.title}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-950/40 text-amber-400 border-amber-500/30">[{res.status}]</span>
            </div>
            <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{res.summary}</p>
            <div className="flex items-center justify-between pt-2 border-t border-gray-800/80 text-gray-500 text-[10px]">
              <span>Source: {res.url || 'Not connected'}</span><span>Reliability: {res.reliability}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
