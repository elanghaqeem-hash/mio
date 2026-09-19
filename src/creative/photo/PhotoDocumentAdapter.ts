import type { CreativeCommand, CreativeDocument, CreativeNode } from '../../types/creativeDocument';
import { createCreativeDocument } from '../CreativeDocumentFactory';
import { PHOTO_DOMAIN_VERSION, createPhotoCanvas, identityPhotoTransform, type PhotoBlendMode, type PhotoDocument, type PhotoNode, type PhotoNodeType } from './PhotoDocumentModel';
import { validatePhotoDocument } from './PhotoDocumentValidation';

export const createPhotoDocument=(name:string,width:number,height:number,now=Date.now(),id=`photo_${now}`):PhotoDocument=>{
 const base=createCreativeDocument('photo',name,now,id);
 const document={...base,metadata:{...base.metadata,photo:{photoDomainVersion:PHOTO_DOMAIN_VERSION,canvas:createPhotoCanvas(width,height)}}} as PhotoDocument;
 const validation=validatePhotoDocument(document); if(!validation.valid)throw new Error(validation.errors.join(' ')); return document;
};
export const createPhotoNode=(id:string,name:string,type:PhotoNodeType,parentId:string|null=null):PhotoNode=>({id,name,type,parentId,childIds:[],visible:true,locked:false,properties:{opacity:1,blendMode:'normal',transform:identityPhotoTransform()}});
export type PhotoCommand =
 | {type:'photo.layer.create';node:PhotoNode;index?:number}
 | {type:'photo.layer.opacity';nodeId:string;opacity:number}
 | {type:'photo.layer.blend';nodeId:string;blendMode:PhotoBlendMode}
 | {type:'photo.mask.attach';nodeId:string;mask:import('./PhotoDocumentModel').PhotoMask}
 | {type:'photo.mask.detach';nodeId:string;maskId:string}
 | {type:'photo.mask.update';nodeId:string;maskId:string;changes:Partial<import('./PhotoDocumentModel').PhotoMask>}
 | {type:'photo.adjustment.add';nodeId:string;adjustment:import('./PhotoDocumentModel').PhotoAdjustment}
 | {type:'photo.adjustment.update';nodeId:string;adjustmentId:string;changes:Partial<import('./PhotoDocumentModel').PhotoAdjustment>}
 | {type:'photo.adjustment.remove';nodeId:string;adjustmentId:string}
 | {type:'photo.layer.bindSource';nodeId:string;assetId?:string}
 | {type:'photo.layer.clip';nodeId:string;targetId?:string};
export const compilePhotoCommand=(document:CreativeDocument,command:PhotoCommand):CreativeCommand=>{
 if(document.kind!=='photo')throw new Error('Photo commands require a photo document.');
 switch(command.type){
  case 'photo.layer.create':return {type:'node.create',node:command.node,index:command.index};
  case 'photo.layer.opacity':{if(command.opacity<0||command.opacity>1)throw new Error('Opacity must be between 0 and 1.');const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,opacity:command.opacity}}};}
  case 'photo.layer.blend':{const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,blendMode:command.blendMode}}};}
  case 'photo.mask.attach':{const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);const masks=((node.properties as any).masks??[]);if(masks.some((m:any)=>m.id===command.mask.id))throw new Error(`Mask ${command.mask.id} already exists.`);return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,masks:[...masks,command.mask]}}};}
  case 'photo.mask.detach':{const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);const masks=((node.properties as any).masks??[]);if(!masks.some((m:any)=>m.id===command.maskId))throw new Error(`Mask ${command.maskId} does not exist.`);return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,masks:masks.filter((m:any)=>m.id!==command.maskId)}}};}
  case 'photo.mask.update':{const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);const masks=((node.properties as any).masks??[]);if(!masks.some((m:any)=>m.id===command.maskId))throw new Error(`Mask ${command.maskId} does not exist.`);return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,masks:masks.map((m:any)=>m.id===command.maskId?{...m,...command.changes}:m)}}};}
  case 'photo.adjustment.add':{const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);const adjustments=((node.properties as any).adjustments??[]);return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,adjustments:[...adjustments,command.adjustment]}}};}
  case 'photo.adjustment.update':{const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);const adjustments=((node.properties as any).adjustments??[]);if(!adjustments.some((a:any)=>a.id===command.adjustmentId))throw new Error(`Adjustment ${command.adjustmentId} does not exist.`);return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,adjustments:adjustments.map((a:any)=>a.id===command.adjustmentId?{...a,...command.changes}:a)}}};}
  case 'photo.adjustment.remove':{const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);const adjustments=((node.properties as any).adjustments??[]);if(!adjustments.some((a:any)=>a.id===command.adjustmentId))throw new Error(`Adjustment ${command.adjustmentId} does not exist.`);return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,adjustments:adjustments.filter((a:any)=>a.id!==command.adjustmentId)}}};}
  case 'photo.layer.bindSource':{const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);if(command.assetId&&!document.assets[command.assetId])throw new Error(`Source asset ${command.assetId} does not exist.`);if(node.type==='photo.group'||node.type==='photo.adjustment')throw new Error(`${node.type} cannot bind a raster source asset.`);return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,sourceAssetId:command.assetId}}};}
  case 'photo.layer.clip':{const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);if(command.targetId&&!document.nodes[command.targetId])throw new Error(`Clipping target ${command.targetId} does not exist.`);if(command.targetId===command.nodeId)throw new Error('A layer cannot clip to itself.');if(command.targetId){const target=document.nodes[command.targetId];if(target.parentId!==node.parentId)throw new Error('Clipping layers must share the same parent.');let cursor:string|undefined=command.targetId;const seen=new Set<string>([command.nodeId]);while(cursor){if(seen.has(cursor))throw new Error('Clipping relationship would create a cycle.');seen.add(cursor);cursor=(document.nodes[cursor]?.properties as any)?.clippingTargetId;}}return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,clippingTargetId:command.targetId}}};}
 }
};
export const asPhotoDocument=(document:CreativeDocument):PhotoDocument=>{const candidate=document as PhotoDocument;const validation=validatePhotoDocument(candidate);if(!validation.valid)throw new Error(`Invalid photo document: ${validation.errors.join(' ')}`);return candidate;};
export const asPhotoNode=(node:CreativeNode):PhotoNode=>node as PhotoNode;
