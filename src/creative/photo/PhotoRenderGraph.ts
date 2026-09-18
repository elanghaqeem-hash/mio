import type { PhotoDocument, PhotoNode } from './PhotoDocumentModel';
export type PhotoRenderDirtyKind='composite'|'geometry'|'mask'|'pixels'|'color';
export interface PhotoRenderNode {id:string;sourceNodeId:string;type:PhotoNode['type'];dependencies:string[];revision:number;visible:boolean;cacheKey:string;}
export interface PhotoRenderGraph {documentId:string;documentRevision:number;roots:string[];nodes:Record<string,PhotoRenderNode>;}
const stable=(value:unknown):string=>{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value);};
const key=(document:PhotoDocument,node:PhotoNode)=>[document.id,document.revision,node.id,node.type,node.visible?1:0,stable(node.properties)].join(':');
export const buildPhotoRenderGraph=(document:PhotoDocument):PhotoRenderGraph=>{
 const nodes:Record<string,PhotoRenderNode>={};
 for(const raw of Object.values(document.nodes)){
  if(!raw.type.startsWith('photo.'))continue;const node=raw as PhotoNode;
  const deps=[...node.childIds];if(node.properties.clippingTargetId)deps.push(node.properties.clippingTargetId);
  nodes[node.id]={id:`render:${node.id}`,sourceNodeId:node.id,type:node.type,dependencies:[...new Set(deps)].sort(),revision:document.revision,visible:node.visible,cacheKey:key(document,node)};
 }
 return {documentId:document.id,documentRevision:document.revision,roots:document.rootNodeIds.filter(id=>Boolean(nodes[id])),nodes};
};
export const collectDirtyRenderNodes=(graph:PhotoRenderGraph,changedNodeIds:string[]):Set<string>=>{
 const dirty=new Set(changedNodeIds.filter(id=>Boolean(graph.nodes[id])));let changed=true;
 while(changed){changed=false;for(const node of Object.values(graph.nodes))if(!dirty.has(node.sourceNodeId)&&node.dependencies.some(id=>dirty.has(id))){dirty.add(node.sourceNodeId);changed=true;}}
 return dirty;
};
export const topologicalPhotoRenderOrder=(graph:PhotoRenderGraph):string[]=>{
 const order:string[]=[],state=new Map<string,0|1|2>();const visit=(id:string)=>{const s=state.get(id)??0;if(s===1)throw new Error(`Photo render dependency cycle at ${id}.`);if(s===2)return;state.set(id,1);for(const dep of graph.nodes[id]?.dependencies??[])if(graph.nodes[dep])visit(dep);state.set(id,2);order.push(id);};
 for(const id of Object.keys(graph.nodes).sort())visit(id);return order;
};

export interface PhotoDirtyRegion {x:number;y:number;width:number;height:number;}
export interface PhotoRenderInvalidation {nodeIds:string[];kinds:PhotoRenderDirtyKind[];region?:PhotoDirtyRegion;}
export const createPhotoRenderInvalidation=(graph:PhotoRenderGraph,input:{affectedNodeIds?:string[];renderHints?:PhotoRenderDirtyKind[]},region?:PhotoDirtyRegion):PhotoRenderInvalidation=>{
 const nodeIds=[...collectDirtyRenderNodes(graph,input.affectedNodeIds??[])].sort();
 const kinds=[...new Set(input.renderHints?.length?input.renderHints:['composite'])];
 if(region&&(!Number.isFinite(region.x)||!Number.isFinite(region.y)||!Number.isFinite(region.width)||!Number.isFinite(region.height)||region.width<=0||region.height<=0))throw new Error('Photo dirty region must have finite coordinates and positive dimensions.');
 return {nodeIds,kinds,region:region?{...region}:undefined};
};
