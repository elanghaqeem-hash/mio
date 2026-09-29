import { validateAssetRelationshipGraph } from '../file-intelligence/AssetRelationshipGraph';
import { exactDuplicateEdge } from '../file-intelligence/ExactDuplicateRelationship';
import { semanticSimilarityEdge } from '../file-intelligence/SemanticSimilarityRelationship';
import { associationEdge,temporalProximityEdge } from '../file-intelligence/AssociationRelationships';
interface SuiteResult{passed:number;total:number}
export async function runRelationshipGraphTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`RelationshipGraph test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const hash='a'.repeat(64);const dup=exactDuplicateEdge('e1','a','b',hash);check(dup.confidence===1&&dup.source==='HASH','Exact duplicate is hash-grounded');
 const sim=semanticSimilarityEdge('e2',{leftAssetId:'a',rightAssetId:'b',score:.8,modelId:'multi-v1',comparable:true,algorithm:'cosine-v1'},.7);check(sim.confidence===.8,'Semantic thresholded edge preserves score');
 const assoc=associationEdge('e3','a','b','SAME_PROJECT','project-x',.6,true);check(assoc.confidence===1&&assoc.source==='USER_CONFIRMED','Confirmed association is explicit');
 const temporal=temporalProximityEdge('e4','a','b',1000,1500,1000);check(temporal.confidence===.5,'Temporal confidence derives from declared window');
 const graph=validateAssetRelationshipGraph({nodes:[{id:'a',modality:'IMAGE'},{id:'b',modality:'DOCUMENT'}],edges:[dup,sim,assoc,temporal],analyzerVersion:'mio-relationship-graph-v1'});check(graph.edges.length===4,'Valid graph accepts evidence-grounded edges');
 let directed=false;try{validateAssetRelationshipGraph({...graph,edges:[{...sim,directed:true}]});}catch{directed=true;}check(directed,'Symmetric semantic edge cannot be directed');
 return {passed,total};
}
