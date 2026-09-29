import type { SmartSearchEvidence,SmartSearchResult } from './SmartSearch';
const modeWeight:Record<SmartSearchEvidence['mode'],number>={FILENAME:1,METADATA:.7,FULL_TEXT:.85,SEMANTIC:.9,CROSS_MODAL:.85};
export interface RankedSearchResult extends SmartSearchResult{matchedModes:SmartSearchEvidence['mode'][];}
export function rankSearchResults(results:readonly SmartSearchResult[],limit=50):RankedSearchResult[]{
 const grouped=new Map<string,SmartSearchResult[]>();for(const r of results){if(!Number.isFinite(r.score)||r.score<0||r.score>1||!r.evidence.length)throw new Error('Search result requires bounded score and evidence');grouped.set(r.assetId,[...(grouped.get(r.assetId)??[]),r]);}
 const ranked=[...grouped.entries()].map(([assetId,items])=>{const evidence=items.flatMap(i=>i.evidence);const modes=[...new Set(evidence.map(e=>e.mode))].sort();let sum=0,w=0;for(const item of items){const iw=Math.max(...item.evidence.map(e=>modeWeight[e.mode]));sum+=item.score*iw;w+=iw;}const diversityBonus=Math.min(.1,(modes.length-1)*.025);return {assetId,score:Math.min(1,sum/w+diversityBonus),evidence,matchedModes:modes};});
 return ranked.sort((a,b)=>b.score-a.score||b.matchedModes.length-a.matchedModes.length||a.assetId.localeCompare(b.assetId)).slice(0,Math.min(500,Math.max(1,limit)));
}
