import type { SemanticClaim,SemanticSource } from './SemanticProfile';
export interface SemanticConfidenceSummary{confidence:number;claimCount:number;confirmedCount:number;sources:SemanticSource[];}
const sourceWeight:Record<SemanticSource,number>={USER_CONFIRMED:1,LOCAL_MODEL:.9,EXTERNAL_MODEL:.9,LOCAL_HEURISTIC:.75,IMPORTED:.7};
export function summarizeSemanticConfidence(claims:readonly SemanticClaim[]):SemanticConfidenceSummary{
 if(claims.length===0)return {confidence:0,claimCount:0,confirmedCount:0,sources:[]};
 let weighted=0,weights=0;for(const c of claims){const w=sourceWeight[c.source];weighted+=c.confidence*w;weights+=w;}
 return {confidence:Math.max(0,Math.min(1,weighted/weights)),claimCount:claims.length,confirmedCount:claims.filter(c=>c.source==='USER_CONFIRMED').length,sources:[...new Set(claims.map(c=>c.source))].sort()};
}
