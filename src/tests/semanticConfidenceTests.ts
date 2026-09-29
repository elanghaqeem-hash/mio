import { summarizeSemanticConfidence } from '../file-intelligence/SemanticConfidence';
import type { SemanticClaim } from '../file-intelligence/SemanticProfile';
interface SuiteResult{passed:number;total:number}
export async function runSemanticConfidenceTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`SemanticConfidence test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const claim=(id:string,confidence:number,source:SemanticClaim['source']):SemanticClaim=>({id,kind:'TAG',value:id,confidence,source,modelId:source.includes('MODEL')?'fixture-model':undefined,externalProcessing:source==='EXTERNAL_MODEL',evidence:[{modality:'IMAGE',assetId:'asset-1'}]});
 const s=summarizeSemanticConfidence([claim('a',.8,'LOCAL_HEURISTIC'),claim('b',1,'USER_CONFIRMED')]);
 check(s.confidence>=0&&s.confidence<=1,'Aggregate confidence is bounded');
 check(s.confirmedCount===1,'User-confirmed evidence remains explicit');
 check(s.sources.join(',')==='LOCAL_HEURISTIC,USER_CONFIRMED','Provenance sources are deterministic');
 const empty=summarizeSemanticConfidence([]);check(empty.confidence===0&&empty.claimCount===0,'Empty evidence returns zero confidence');
 return {passed,total};
}
