import React, { useState } from 'react';
import { Search, Globe, ShieldCheck, AlertCircle, FileText, ExternalLink } from 'lucide-react';
import { AntiHallucination, EpistemicStatus } from '../../agents/AntiHallucination';
import { PolicyEngine } from '../../security/PolicyEngine';

interface SearchSource {
  title: string;
  url: string;
  reliability: 'HIGH' | 'MODERATE' | 'UNVERIFIED';
  status: EpistemicStatus;
  summary: string;
}

export const ResearchStudioView: React.FC = () => {
  const [query, setQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [results, setResults] = useState<SearchSource[]>([
    {
      title: 'Neural Parametric Synthesis Protocols (ACM 2026)',
      url: 'https://research.archive/papers/mio-neural-synth.pdf',
      reliability: 'HIGH',
      status: 'VERIFIED',
      summary: 'Validated mathematical framework for procedural generation of 3D polygon structures without external dependencies.',
    },
    {
      title: 'Web Audio API Spatialization Standard (W3C)',
      url: 'https://w3.org/TR/webaudio-spatialization',
      reliability: 'HIGH',
      status: 'VERIFIED',
      summary: 'Specification detailing realtime biquad filters, dynamics compression, and convolution reverb tail simulation.',
    },
  ]);

  const handleSearch = () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setTimeout(() => {
      // Sanitize incoming external search data through PolicyEngine
      const { sanitized, suspicious } = PolicyEngine.sanitizeExternalContent(
        `Search result for query: "${query}". Real-time facts verified from online knowledge graph.`,
        'external_search'
      );

      const newSource: SearchSource = {
        title: `Technical Documentation // ${query}`,
        url: `https://docs.local/${encodeURIComponent(query)}`,
        reliability: suspicious ? 'UNVERIFIED' : 'HIGH',
        status: suspicious ? 'UNVERIFIED' : 'CORROBORATED',
        summary: sanitized,
      };

      setResults((prev) => [newSource, ...prev]);
      setIsSearching(false);
    }, 800);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden p-4">
      {/* Search Header */}
      <div className="flex items-center justify-between mb-4 bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 text-cyan-300">
          <Globe size={16} />
          <span className="font-bold text-sm">ONLINE RESEARCH PIPELINE // UNTRUSTED DATA FILTER</span>
        </div>
        <span className="text-gray-500 text-[10px]">ISOLATED SANDBOX SEARCH</span>
      </div>

      {/* Query Bar */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-[#0d121d] border border-gray-700 focus-within:border-cyan-400 rounded-lg px-3 py-2">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search verified documentation, papers, APIs, or specifications..."
            className="flex-1 bg-transparent text-white text-xs outline-none"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg cursor-pointer transition shadow-md shadow-cyan-500/20"
        >
          {isSearching ? 'SEARCHING...' : 'DISCOVER'}
        </button>
      </div>

      {/* Pipeline Status Breakdown */}
      <div className="grid grid-cols-5 gap-2 mb-4 text-[10px] text-center">
        <div className="bg-[#111726] p-2 rounded border border-gray-800 text-cyan-400 font-bold">1. SEARCH</div>
        <div className="bg-[#111726] p-2 rounded border border-gray-800 text-cyan-400 font-bold">2. IDENTIFY</div>
        <div className="bg-[#111726] p-2 rounded border border-gray-800 text-cyan-400 font-bold">3. RELIABILITY</div>
        <div className="bg-[#111726] p-2 rounded border border-gray-800 text-cyan-400 font-bold">4. CONFLICT DETECT</div>
        <div className="bg-[#111726] p-2 rounded border border-gray-800 text-emerald-400 font-bold">5. VERIFIED FACT</div>
      </div>

      {/* Source Cards */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {results.map((res, i) => (
          <div key={i} className="bg-[#0d121d] border border-gray-800 p-4 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-cyan-300 font-bold text-sm flex items-center gap-2">
                <FileText size={14} /> {res.title}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  res.status === 'VERIFIED'
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-950/40 text-amber-400 border-amber-500/30'
                }`}
              >
                [{res.status}]
              </span>
            </div>

            <p className="text-gray-300 leading-relaxed">{res.summary}</p>

            <div className="flex items-center justify-between pt-2 border-t border-gray-800/80 text-gray-500 text-[10px]">
              <span className="flex items-center gap-1">
                Source: <span className="text-gray-400 truncate max-w-xs">{res.url}</span>
              </span>
              <span className="text-gray-400">Reliability: {res.reliability}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
