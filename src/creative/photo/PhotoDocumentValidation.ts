import type { CreativeDocumentValidation } from '../../types/creativeDocument';
import { validateCreativeDocument } from '../CreativeDocumentKernel';
import { PHOTO_DOMAIN_VERSION, PHOTO_NODE_TYPES, type PhotoDocument, type PhotoNode, type PhotoNodeProperties } from './PhotoDocumentModel';

const supported=new Set<string>(PHOTO_NODE_TYPES);
const blendModes=new Set(['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','soft-light','hard-light','difference','exclusion','hue','saturation','color','luminosity']);
const colorSpaces=new Set(['srgb','display-p3','linear-srgb']);
const maskKinds=new Set(['pixel','vector','semantic']);
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
  if(!colorSpaces.has(meta.canvas.colorSpace)) errors.push('Unsupported photo color space.');
  if(!finite(meta.canvas.dpi)||meta.canvas.dpi<=0) errors.push('Photo DPI must be positive.');
 }
 for(const raw of Object.values(document.nodes)){
  if(!raw.type.startsWith('photo.')) { warnings.push(`Node ${raw.id} is not photo-namespaced.`); continue; }
  if(!supported.has(raw.type)){errors.push(`Unsupported photo node type ${raw.type}.`);continue;}
  const node=raw as PhotoNode,p=node.properties as unknown as PhotoNodeProperties;
  if(!finite(p.opacity)||p.opacity<0||p.opacity>1) errors.push(`Photo node ${node.id} opacity must be between 0 and 1.`);
  if(!blendModes.has(p.blendMode)) errors.push(`Photo node ${node.id} has unsupported blend mode ${String(p.blendMode)}.`);
  if(!p.transform||![p.transform.x,p.transform.y,p.transform.scaleX,p.transform.scaleY,p.transform.rotation,p.transform.skewX,p.transform.skewY].every(finite)) errors.push(`Photo node ${node.id} has invalid transform.`);
  if(p.sourceAssetId&&!document.assets[p.sourceAssetId]) errors.push(`Photo node ${node.id} references missing source asset ${p.sourceAssetId}.`);
  if(p.clippingTargetId&&!document.nodes[p.clippingTargetId]) errors.push(`Photo node ${node.id} references missing clipping target ${p.clippingTargetId}.`);
  if(p.clippingTargetId===node.id) errors.push(`Photo node ${node.id} cannot clip to itself.`);
  const maskIds=new Set<string>();for(const mask of p.masks??[]){if(maskIds.has(mask.id))errors.push(`Duplicate mask id ${mask.id} on node ${node.id}.`);maskIds.add(mask.id);if(!maskKinds.has(mask.kind))errors.push(`Mask ${mask.id} has unsupported kind.`);if(mask.density<0||mask.density>1)errors.push(`Mask ${mask.id} density must be between 0 and 1.`);if(mask.feather<0)errors.push(`Mask ${mask.id} feather cannot be negative.`);if(mask.assetReferenceId&&!document.assets[mask.assetReferenceId])errors.push(`Mask ${mask.id} references missing asset ${mask.assetReferenceId}.`);}
  const adjustmentIds=new Set<string>();for(const adjustment of p.adjustments??[]){if(adjustmentIds.has(adjustment.id))errors.push(`Duplicate adjustment id ${adjustment.id} on node ${node.id}.`);adjustmentIds.add(adjustment.id);}
  if(node.type==='photo.adjustment'&&!(p.adjustments?.length))errors.push(`Adjustment layer ${node.id} must contain at least one adjustment.`);
  if(node.type==='photo.group'&&p.sourceAssetId)errors.push(`Photo group ${node.id} cannot bind a raster source asset.`);
 }
 return {valid:errors.length===0,errors,warnings};
};
