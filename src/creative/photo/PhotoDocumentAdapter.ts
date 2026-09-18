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
 | {type:'photo.layer.blend';nodeId:string;blendMode:PhotoBlendMode};
export const compilePhotoCommand=(document:CreativeDocument,command:PhotoCommand):CreativeCommand=>{
 if(document.kind!=='photo')throw new Error('Photo commands require a photo document.');
 switch(command.type){
  case 'photo.layer.create':return {type:'node.create',node:command.node,index:command.index};
  case 'photo.layer.opacity':{if(command.opacity<0||command.opacity>1)throw new Error('Opacity must be between 0 and 1.');const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,opacity:command.opacity}}};}
  case 'photo.layer.blend':{const node=document.nodes[command.nodeId];if(!node)throw new Error(`Node ${command.nodeId} does not exist.`);return {type:'node.update',nodeId:command.nodeId,changes:{properties:{...node.properties,blendMode:command.blendMode}}};}
 }
};
export const asPhotoDocument=(document:CreativeDocument):PhotoDocument=>{const candidate=document as PhotoDocument;const validation=validatePhotoDocument(candidate);if(!validation.valid)throw new Error(`Invalid photo document: ${validation.errors.join(' ')}`);return candidate;};
export const asPhotoNode=(node:CreativeNode):PhotoNode=>node as PhotoNode;
