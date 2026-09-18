import type { PhotoRenderGraph, PhotoRenderInvalidation, PhotoRenderDirtyKind, PhotoDirtyRegion } from './PhotoRenderGraph';
import { topologicalPhotoRenderOrder } from './PhotoRenderGraph';
export interface PhotoRenderTask {nodeId:string;renderNodeId:string;kinds:PhotoRenderDirtyKind[];region?:PhotoDirtyRegion;cacheKey:string;}
export interface PhotoRenderExecutionPlan {documentId:string;revision:number;fullRender:boolean;tasks:PhotoRenderTask[];}
export const createPhotoRenderExecutionPlan=(graph:PhotoRenderGraph,invalidation?:PhotoRenderInvalidation):PhotoRenderExecutionPlan=>{
 const order=topologicalPhotoRenderOrder(graph);
 const target=invalidation?new Set(invalidation.nodeIds):new Set(order);
 const kinds:PhotoRenderDirtyKind[]=invalidation?.kinds?.length?invalidation.kinds:['composite'];
 const tasks=order.filter(id=>target.has(id)&&graph.nodes[id]?.visible).map(id=>({nodeId:id,renderNodeId:graph.nodes[id].id,kinds:[...kinds],region:invalidation?.region?{...invalidation.region}:undefined,cacheKey:graph.nodes[id].cacheKey}));
 return {documentId:graph.documentId,revision:graph.documentRevision,fullRender:!invalidation,tasks};
};
