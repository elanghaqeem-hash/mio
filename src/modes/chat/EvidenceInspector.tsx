import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileSearch } from 'lucide-react';
import type { EvidenceAudit } from '../../intelligence/EvidenceGrounding';

interface Props { audit: EvidenceAudit; messageId: string; }

export const EvidenceInspector: React.FC<Props> = ({ audit, messageId }) => {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  return (
    <div className="rounded border border-violet-500/25 bg-violet-950/10 p-2">
      <div className="mb-1 flex items-center gap-1.5 font-bold text-violet-300"><FileSearch size={12} /> CLAIM EVIDENCE INSPECTOR · {audit.method}</div>
      <div className="mb-2 flex gap-2 text-[9px]"><span className="text-emerald-300">SUPPORTED {audit.supported}</span><span className="text-amber-300">INFERENCE {audit.inference}</span><span className="text-rose-300">UNSUPPORTED {audit.unsupported}</span></div>
      <div className="space-y-1">
        {audit.claims.slice(0, 8).map((claim, index) => {
          const isExpanded = expanded[index] === true;
          return (
            <div key={`${messageId}-claim-${index}`} className="rounded border border-gray-800/70 bg-black/20 p-1.5 text-[9px]">
              <button className="flex w-full items-start gap-1.5 text-left" onClick={() => setExpanded((current) => ({ ...current, [index]: !isExpanded }))}>
                {claim.evidence.length > 0 ? (isExpanded ? <ChevronDown size={10} className="mt-0.5 shrink-0 text-gray-500" /> : <ChevronRight size={10} className="mt-0.5 shrink-0 text-gray-500" />) : <span className="w-[10px] shrink-0" />}
                <span className={claim.status === 'SUPPORTED' ? 'shrink-0 text-emerald-300' : claim.status === 'INFERENCE' ? 'shrink-0 text-amber-300' : 'shrink-0 text-rose-300'}>{claim.status}</span>
                <span className="text-gray-400">{claim.text}</span>
              </button>
              {isExpanded && claim.evidence.length > 0 && <div className="ml-4 mt-2 space-y-1.5">{claim.evidence.map((evidence) => <div key={`${evidence.assetId}-${evidence.sourceUri}`} className="rounded border border-gray-800 bg-[#0b1018] p-2"><div className="flex flex-wrap items-center gap-1.5"><span className="font-bold text-cyan-300">{evidence.label}</span><span className={`rounded px-1 py-0.5 text-[8px] ${evidence.trust === 'VERIFIED' ? 'bg-emerald-950/50 text-emerald-300' : 'bg-amber-950/50 text-amber-300'}`}>{evidence.trust}</span><span className="text-[8px] text-gray-600">{evidence.freshness ?? 'UNKNOWN'}</span></div><div className="mt-1 text-gray-500">“{evidence.excerpt}”</div><div className="mt-1 truncate text-[8px] text-gray-600">{evidence.sourceUri}</div><div className="mt-0.5 text-[8px] text-gray-600">OVERLAP: {evidence.overlapTerms.join(', ') || 'none'}</div></div>)}</div>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[8px] text-gray-600">Excerpts show bounded source text used by the lexical support heuristic. They do not prove factual truth or semantic entailment.</div>
    </div>
  );
};
