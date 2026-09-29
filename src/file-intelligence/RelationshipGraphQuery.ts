import { validateAssetRelationshipGraph,type AssetGraphEdge,type AssetRelationshipGraph } from './AssetRelationshipGraph';
export interface GraphTraversalOptions{maxDepth?:number;maxNodes?:number;direction?:'OUT'|'IN'|'BOTH';kinds?:AssetGraphEdge['kind'][];}
export interface GraphTraversalResult{nodeIds:string[];edgeIds:string[];truncated:boolean;}
export function traverseAssetGraph(g:AssetRelationshipGraph,startId:string,o:GraphTraversalOptions={}):GraphTraversalResult{
 validateAssetRelationshipGraph(g);if(!g.nodes.some(n=>n.id===startId))throw new Error('Traversal start node does not exist');
 const maxDepth=Math.min(8,Math.max(0,o.maxDepth??2)),maxNodes=Math.min(1000,Math.max(1,o.maxNodes??100)),direction=o.direction??'BOTH',kinds=o.kinds?new Set(o.kinds):undefined;
 const seen=new Set([startId]),edges=new Set<string>(),q:[string,number][]=[[startId,0]];let truncated=false;
 while(q.length){const [node,depth]=q.shift()!;if(depth>=maxDepth)continue;for(const e of g.edges){if(kinds&&!kinds.has(e.kind))continue;let next:string|undefined;if((direction==='OUT'||direction==='BOTH')&&e.from===node)next=e.to;if((direction==='IN'||direction==='BOTH')&&e.to===node)next=e.from;if(!next)continue;edges.add(e.id);if(seen.has(next))continue;if(seen.size>=maxNodes){truncated=true;continue;}seen.add(next);q.push([next,depth+1]);}}
 return {nodeIds:[...seen],edgeIds:[...edges],truncated};
}
