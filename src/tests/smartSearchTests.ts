import { validateSmartSearchQuery } from '../file-intelligence/SmartSearch';
import { lexicalSearch } from '../file-intelligence/LexicalSearch';
import { semanticEmbeddingSearch } from '../file-intelligence/SemanticSearch';
import { validateNaturalLanguageSearchPlan } from '../file-intelligence/NaturalLanguageSearchPlan';
import { rankSearchResults } from '../file-intelligence/SearchRanking';
import type { SemanticEmbedding } from '../file-intelligence/SemanticEmbedding';
interface SuiteResult{passed:number;total:number}
export async function runSmartSearchTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`SmartSearch test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const q=validateSmartSearchQuery({text:'  Annual Report ',modes:['FILENAME','FULL_TEXT'],limit:10});check(q.text==='Annual Report'&&q.limit===10,'Query normalization preserves explicit bounds');
 const lex=lexicalSearch([{assetId:'a',filename:'annual-report.pdf',metadata:{year:2026},text:'Board annual report'}],'annual',['FILENAME','FULL_TEXT']);check(lex[0].evidence.length===2,'Lexical search retains multiple evidence modes');
 const emb=(assetId:string,modality:SemanticEmbedding['modality'],values:number[]):SemanticEmbedding=>({assetId,modality,dimensions:2,values,modelId:'multi-v1',source:'LOCAL_MODEL',externalProcessing:false,normalized:true,analyzerVersion:'mio-semantic-embedding-v1'});
 const sem=semanticEmbeddingSearch(emb('query','IMAGE',[1,0]),[emb('audio','AUDIO',[1,0])]);check(sem[0].evidence[0].mode==='CROSS_MODAL'&&sem[0].score===1,'Cross-modal search preserves embedding evidence');
 const plan=validateNaturalLanguageSearchPlan({originalText:'find the annual report',searchText:'annual report',modes:['FULL_TEXT'],filters:{},limit:20,minimumScore:.2,plannerSource:'RULES',externalProcessing:false});check(plan.plannerSource==='RULES','Rule plan does not imply a model');
 const ranked=rankSearchResults([...lex,...sem]);check(ranked.length===2&&ranked.every(r=>r.evidence.length>0),'Ranking preserves evidence and deterministic results');
 return {passed,total};
}
