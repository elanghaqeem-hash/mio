import type { CreativeDocument, CreativeNode } from '../../types/creativeDocument';

export const PHOTO_DOMAIN_VERSION = 1;
export const PHOTO_NODE_TYPES = ['photo.raster','photo.adjustment','photo.group','photo.text','photo.shape','photo.smart'] as const;
export type PhotoNodeType = typeof PHOTO_NODE_TYPES[number];
export type PhotoBlendMode = 'normal'|'multiply'|'screen'|'overlay'|'darken'|'lighten'|'color-dodge'|'color-burn'|'soft-light'|'hard-light'|'difference'|'exclusion'|'hue'|'saturation'|'color'|'luminosity';
export type PhotoMaskKind = 'pixel'|'vector'|'semantic';
export interface PhotoCanvas { width:number; height:number; backgroundColor:string; colorSpace:'srgb'|'display-p3'|'linear-srgb'; bitDepth:8|16|32; dpi:number; }
export interface PhotoTransform { x:number; y:number; scaleX:number; scaleY:number; rotation:number; skewX:number; skewY:number; }
export interface PhotoMask { id:string; kind:PhotoMaskKind; enabled:boolean; inverted:boolean; feather:number; density:number; assetReferenceId?:string; semanticClass?:'subject'|'background'|'sky'|'person'|'object'; }
export type PhotoAdjustmentKind = 'exposure'|'brightness-contrast'|'levels'|'curves'|'white-balance'|'hsl'|'vibrance'|'saturation'|'black-white';
export interface PhotoAdjustment { id:string; kind:PhotoAdjustmentKind; enabled:boolean; parameters:Record<string,number|boolean|string|number[]>; }
export interface PhotoNodeProperties { opacity:number; blendMode:PhotoBlendMode; transform:PhotoTransform; masks?:PhotoMask[]; adjustments?:PhotoAdjustment[]; sourceAssetId?:string; clippingTargetId?:string; }
export interface PhotoNode extends CreativeNode { type:PhotoNodeType; properties:PhotoNodeProperties & Record<string,unknown>; }
export interface PhotoDocumentMetadata { photoDomainVersion:number; canvas:PhotoCanvas; pixelSelectionAssetId?:string; }
export type PhotoDocument = CreativeDocument & { kind:'photo'; metadata:CreativeDocument['metadata'] & { photo:PhotoDocumentMetadata } };
export const identityPhotoTransform=():PhotoTransform=>({x:0,y:0,scaleX:1,scaleY:1,rotation:0,skewX:0,skewY:0});
export const createPhotoCanvas=(width:number,height:number):PhotoCanvas=>({width,height,backgroundColor:'#000000',colorSpace:'srgb',bitDepth:8,dpi:72});
