import { contentRelationshipEdge } from '../file-intelligence/ContentDependencyRelationships';
import { traverseAssetGraph } from '../file-intelligence/RelationshipGraphQuery';
import type { AssetRelationshipGraph } from '../file-intelligence/AssetRelationshipGraph';
interface SuiteResult{passed:number;total:number}
export async function runRelationshipGraphQueryTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`RelationshipGraphQuery test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const dep=contentRelationshipEdge('d1','a','b','DEPENDENCY','texture:base.png');check(dep.directed&&dep.source==='STRUCTURE','Dependency is directed and structure-grounded');
 const graph:AssetRelationshipGraph={nodes:['a','b','c','d'].map(id=>({id,modality:'FILE_METADATA'})),edges:[dep,contentRelationshipEdge('d2','b','c','CONTENT_REFERENCE','manifest:c'),contentRelationshipEdge('d3','c','d','DEPENDENCY','manifest:d')],analyzerVersion:'mio-relationship-graph-v1'};
 const depth=traverseAssetGraph(graph,'a',{direction:'OUT',maxDepth:2,maxNodes:10});check(depth.nodeIds.includes('c')&&!depth.nodeIds.includes('d'),'Traversal respects depth bound');
 const cap=traverseAssetGraph(graph,'a',{direction:'OUT',maxDepth:8,maxNodes:2});check(cap.nodeIds.length===2&&cap.truncated,'Traversal reports node cap truncation');
 const filtered=traverseAssetGraph(graph,'a',{direction:'OUT',maxDepth:8,kinds:['DEPENDENCY']});check(filtered.nodeIds.join(',')==='a,b','Traversal filters relationship kinds');
 return {passed,total};
}
