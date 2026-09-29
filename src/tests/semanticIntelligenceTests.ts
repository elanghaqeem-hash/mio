import { collectSemanticEntities } from '../file-intelligence/SemanticEntities';
import { validateSemanticEmbedding } from '../file-intelligence/SemanticEmbedding';
import { compareSemanticEmbeddings } from '../file-intelligence/CrossModalSimilarity';
import type { SemanticClaim } from '../file-intelligence/SemanticProfile';
interface SuiteResult{passed:number;total:number}
export async function runSemanticIntelligenceTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`SemanticIntelligence test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const base:SemanticClaim={id:'e1',kind:'ENTITY',value:'ORGANIZATION:OpenAI',confidence:.9,source:'LOCAL_HEURISTIC',externalProcessing:false,evidence:[{modality:'DOCUMENT',assetId:'d1'}]};
 check(collectSemanticEntities([base,{...base,id:'e2',confidence:.8}])[0].claimIds.length===2,'Duplicate entities aggregate evidence');
 const a=validateSemanticEmbedding({assetId:'a',modality:'IMAGE',dimensions:2,values:[1,0],modelId:'multi-v1',source:'LOCAL_MODEL',externalProcessing:false,normalized:true,analyzerVersion:'mio-semantic-embedding-v1'});
 const b=validateSemanticEmbedding({...a,assetId:'b',modality:'AUDIO',values:[1,0]});
 check(compareSemanticEmbeddings(a,b).score===1,'Identical cross-modal embeddings score 1');
 let mismatch=false;try{compareSemanticEmbeddings(a,{...b,modelId:'other'});}catch{mismatch=true;}check(mismatch,'Different embedding spaces are rejected');
 let zero=false;try{validateSemanticEmbedding({...a,values:[0,0],normalized:false});}catch{zero=true;}check(zero,'Zero vectors are rejected');
 return {passed,total};
}
