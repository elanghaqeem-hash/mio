import type { PhotoBlendMode } from './PhotoDocumentModel';
import type { PhotoPixelBuffer, PhotoRenderSurface } from './PhotoRenderer';
import { blendSourceOver, createPhotoRenderSurface } from './PhotoRenderer';
const clamp=(v:number,min=0,max=255)=>Math.max(min,Math.min(max,Math.round(v)));
const blendChannel=(mode:PhotoBlendMode,s:number,d:number)=>{switch(mode){case 'multiply':return s*d/255;case 'screen':return 255-(255-s)*(255-d)/255;case 'darken':return Math.min(s,d);case 'lighten':return Math.max(s,d);case 'difference':return Math.abs(d-s);case 'exclusion':return d+s-2*d*s/255;default:return s;}};
export const applyPhotoMaskAlpha=(alpha:number,mask:number,density=1,inverted=false)=>{const d=Math.max(0,Math.min(1,density));const m=Math.max(0,Math.min(1,mask))*d;return Math.max(0,Math.min(1,alpha*(inverted?1-m:m)));};
export const compositePhotoLayer=(dst:PhotoPixelBuffer,src:PhotoPixelBuffer,opacity=1,mode:PhotoBlendMode='normal'):void=>{
 if(dst.width!==src.width||dst.height!==src.height)throw new Error('Pixel buffer dimensions must match.');
 if(mode==='normal'){blendSourceOver(dst,src,opacity);return;}
 const oa=Math.max(0,Math.min(1,opacity));
 for(let i=0;i<dst.data.length;i+=4){const sa=src.data[i+3]/255*oa,da=dst.data[i+3]/255,outA=sa+da*(1-sa);if(outA<=0){dst.data[i]=dst.data[i+1]=dst.data[i+2]=dst.data[i+3]=0;continue;}for(let c=0;c<3;c++){const s=src.data[i+c],d=dst.data[i+c],b=blendChannel(mode,s,d);dst.data[i+c]=clamp((b*sa+d*da*(1-sa))/outA);}dst.data[i+3]=clamp(outA*255);}}
export interface PhotoCpuLayer {pixels:PhotoPixelBuffer;opacity:number;blendMode:PhotoBlendMode;visible:boolean;mask?:{data:Uint8ClampedArray;width:number;height:number;inverted?:boolean;density?:number};}
export const compositePhotoLayers=(width:number,height:number,layers:readonly PhotoCpuLayer[]):PhotoRenderSurface=>{const surface=createPhotoRenderSurface(width,height);for(const layer of layers)if(layer.visible){if(layer.mask){if(layer.mask.width!==width||layer.mask.height!==height)throw new Error('Photo mask dimensions must match the render surface.');const filtered=new Uint8ClampedArray(layer.pixels.data);for(let i=0,p=0;i<filtered.length;i+=4,p++)filtered[i+3]=Math.round(applyPhotoMaskAlpha(filtered[i+3]/255,layer.mask.data[p]/255,layer.mask.density??1,layer.mask.inverted??false)*255);compositePhotoLayer(surface.pixels,{...layer.pixels,data:filtered},layer.opacity,layer.blendMode);}else compositePhotoLayer(surface.pixels,layer.pixels,layer.opacity,layer.blendMode);}return surface;};
