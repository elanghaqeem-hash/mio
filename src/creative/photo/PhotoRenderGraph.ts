import type { PhotoDocument, PhotoNode } from './PhotoDocumentModel';
export type PhotoRenderDirtyKind='composite'|'geometry'|'mask'|'pixels'|'color';
export interface PhotoRenderNode {id:string;sourceNodeId:string;type:PhotoNode['type'];dependencies:string[];revision:number;visible:boolean;cacheKey:string;}
export interface PhotoRenderGraph {documentId:string;documentRevision:number;roots:string[];nodes:Record<string,PhotoRenderNode>;}
const key=(document:PhotoDocument,node:PhotoNode)=>[document.id,document.revision,node.id,node.type,node.visible?1:0,JSON.stringify(node.properties)].join(':');
export const buildPhotoRenderGraph=(document:PhotoDocument):PhotoRenderGraph=>{
 const nodes:Record<string,PhotoRenderNode>={};
 for(const raw of Object.values(document.nodes)){
  if(!raw.type.startsWith('photo.'))continue;const node=raw as PhotoNode;
  const deps=[...node.childIds];
  if(node.properties.clippingTargetId)deps.push(node.properties.clippingTargetId);
  nodes[node.id]={id:`render:${node.id}`,sourceNodeId:node.id,type:node.type,dependencies:[...new Set(deps)],revision:document.revision,visible:node.visible,cacheKey:key(document,node)};
 }
 return {documentId:document.id,documentRevision:document.revision,roots:document.rootNodeIds.filter(id=>Boolean(nodes[id])),nodes};
};
export const collectDirtyRenderNodes=(graph:PhotoRenderGraph,changedNodeIds:string[]):Set<string>=>{
 const dirty=new Set(changedNodeIds.filter(id=>Boolean(graph.nodes[id])));let changed=true;
 while(changed){changed=false;for(const node of Object.values(graph.nodes))if(!dirty.has(node.sourceNodeId)&&node.dependencies.some(id=>dirty.has(id))){dirty.add(node.sourceNodeId);changed=true;}}
 return dirty;
};
