export type AssetRelationshipKind='EXACT_DUPLICATE'|'SEMANTIC_SIMILARITY'|'SAME_PROJECT'|'SAME_CLIENT'|'TEMPORAL_PROXIMITY'|'CONTENT_REFERENCE'|'DEPENDENCY';
export type AssetRelationshipSource='HASH'|'SEMANTIC'|'METADATA'|'STRUCTURE'|'USER_CONFIRMED';
export interface AssetGraphNode{id:string;modality:string;}
export interface AssetGraphEdge{id:string;from:string;to:string;kind:AssetRelationshipKind;directed:boolean;confidence:number;source:AssetRelationshipSource;evidenceIds:string[];}
export interface AssetRelationshipGraph{nodes:AssetGraphNode[];edges:AssetGraphEdge[];analyzerVersion:'mio-relationship-graph-v1';}
export function validateAssetRelationshipGraph(g:AssetRelationshipGraph):AssetRelationshipGraph{
 const nodes=new Set<string>();for(const n of g.nodes){if(!n.id.trim()||nodes.has(n.id))throw new Error('Graph node IDs must be non-empty and unique');nodes.add(n.id);}
 const edges=new Set<string>();for(const e of g.edges){if(!e.id.trim()||edges.has(e.id))throw new Error('Graph edge IDs must be non-empty and unique');edges.add(e.id);if(!nodes.has(e.from)||!nodes.has(e.to)||e.from===e.to)throw new Error('Graph edge endpoints must reference distinct existing nodes');if(!Number.isFinite(e.confidence)||e.confidence<0||e.confidence>1||e.evidenceIds.length===0)throw new Error('Graph edge requires bounded confidence and evidence');if((e.kind==='EXACT_DUPLICATE'||e.kind==='SEMANTIC_SIMILARITY'||e.kind==='SAME_PROJECT'||e.kind==='SAME_CLIENT'||e.kind==='TEMPORAL_PROXIMITY')&&e.directed)throw new Error('Symmetric relationship cannot be directed');}
 return g;
}
