import type { PhotoRenderGraph, PhotoRenderInvalidation, PhotoRenderDirtyKind, PhotoDirtyRegion } from './PhotoRenderGraph';
import { topologicalPhotoRenderOrder } from './PhotoRenderGraph';
export type PhotoRenderPriority='interactive'|'foreground'|'background';
export interface PhotoRenderTask {nodeId:string;renderNodeId:string;kinds:PhotoRenderDirtyKind[];region?:PhotoDirtyRegion;cacheKey:string;priority:PhotoRenderPriority;reason:'full-render'|'invalidation';}
export interface PhotoRenderExecutionPlan {documentId:string;revision:number;fullRender:boolean;tasks:PhotoRenderTask[];}
export interface PhotoRenderPlanOptions {cachedKeys?:ReadonlySet<string>;canvas?:{width:number;height:number};priority?:PhotoRenderPriority;}
const clip=(r:PhotoDirtyRegion|undefined,c:PhotoRenderPlanOptions['canvas']):PhotoDirtyRegion|undefined=>{if(!r||!c)return r?{...r}:undefined;const x=Math.max(0,r.x),y=Math.max(0,r.y),right=Math.min(c.width,r.x+r.width),bottom=Math.min(c.height,r.y+r.height);return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:undefined;};
export const createPhotoRenderExecutionPlan=(graph:PhotoRenderGraph,invalidation?:PhotoRenderInvalidation,options:PhotoRenderPlanOptions={}):PhotoRenderExecutionPlan=>{
 const order=topologicalPhotoRenderOrder(graph),target=invalidation?new Set(invalidation.nodeIds):new Set(order);
 const kinds:PhotoRenderDirtyKind[]=invalidation?.kinds?.length?invalidation.kinds:['composite'],region=clip(invalidation?.region,options.canvas);
 const tasks:PhotoRenderTask[]=order.filter(id=>target.has(id)&&graph.nodes[id]?.visible&&!options.cachedKeys?.has(graph.nodes[id].cacheKey)).map(id=>({nodeId:id,renderNodeId:graph.nodes[id].id,kinds:[...kinds],region,cacheKey:graph.nodes[id].cacheKey,priority:options.priority??(invalidation?'interactive':'foreground'),reason:invalidation?'invalidation':'full-render'}));
 return {documentId:graph.documentId,revision:graph.documentRevision,fullRender:!invalidation,tasks};
};
