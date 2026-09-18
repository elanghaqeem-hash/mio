import type { CreativeDocumentValidation } from '../../types/creativeDocument';
import { validateCreativeDocument } from '../CreativeDocumentKernel';
import { PHOTO_DOMAIN_VERSION, PHOTO_NODE_TYPES, type PhotoDocument, type PhotoNode, type PhotoNodeProperties } from './PhotoDocumentModel';

const supported=new Set<string>(PHOTO_NODE_TYPES);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
export const validatePhotoDocument=(document:PhotoDocument):CreativeDocumentValidation=>{
 const base=validateCreativeDocument(document),errors=[...base.errors],warnings=[...base.warnings];
 if(document.kind!=='photo') errors.push('Photo document kind must be photo.');
 const meta=document.metadata.photo;
 if(!meta) errors.push('Photo metadata is required.');
 else {
  if(meta.photoDomainVersion!==PHOTO_DOMAIN_VERSION) errors.push(`Unsupported photo domain version ${meta.photoDomainVersion}.`);
  if(!Number.isInteger(meta.canvas.width)||meta.canvas.width<=0||!Number.isInteger(meta.canvas.height)||meta.canvas.height<=0) errors.push('Photo canvas dimensions must be positive integers.');
  if(![8,16,32].includes(meta.canvas.bitDepth)) errors.push('Unsupported photo bit depth.');
  if(!finite(meta.canvas.dpi)||meta.canvas.dpi<=0) errors.push('Photo DPI must be positive.');
 }
 for(const raw of Object.values(document.nodes)){
  if(!raw.type.startsWith('photo.')) { warnings.push(`Node ${raw.id} is not photo-namespaced.`); continue; }
  if(!supported.has(raw.type)){errors.push(`Unsupported photo node type ${raw.type}.`);continue;}
  const node=raw as PhotoNode,p=node.properties as unknown as PhotoNodeProperties;
  if(!finite(p.opacity)||p.opacity<0||p.opacity>1) errors.push(`Photo node ${node.id} opacity must be between 0 and 1.`);
  if(!p.transform||![p.transform.x,p.transform.y,p.transform.scaleX,p.transform.scaleY,p.transform.rotation,p.transform.skewX,p.transform.skewY].every(finite)) errors.push(`Photo node ${node.id} has invalid transform.`);
  if(p.sourceAssetId&&!document.assets[p.sourceAssetId]) errors.push(`Photo node ${node.id} references missing source asset ${p.sourceAssetId}.`);
  if(p.clippingTargetId&&!document.nodes[p.clippingTargetId]) errors.push(`Photo node ${node.id} references missing clipping target ${p.clippingTargetId}.`);
  for(const mask of p.masks??[]){if(mask.density<0||mask.density>1)errors.push(`Mask ${mask.id} density must be between 0 and 1.`);if(mask.feather<0)errors.push(`Mask ${mask.id} feather cannot be negative.`);if(mask.assetReferenceId&&!document.assets[mask.assetReferenceId])errors.push(`Mask ${mask.id} references missing asset ${mask.assetReferenceId}.`);}
 }
 return {valid:errors.length===0,errors,warnings};
};
