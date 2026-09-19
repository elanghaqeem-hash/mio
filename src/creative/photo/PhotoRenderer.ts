export interface PhotoPixelBuffer {width:number;height:number;data:Uint8ClampedArray;}
export interface PhotoRenderSurface {width:number;height:number;pixels:PhotoPixelBuffer;}
export interface PhotoRenderFrame {documentId:string;revision:number;surface:PhotoRenderSurface;}
export interface PhotoRenderer {readonly id:string;render(frame:PhotoRenderFrame):Promise<PhotoRenderSurface>|PhotoRenderSurface;}
export const createPhotoRenderSurface=(width:number,height:number):PhotoRenderSurface=>{if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('Photo render surface dimensions must be positive integers.');return {width,height,pixels:{width,height,data:new Uint8ClampedArray(width*height*4)}};};
export const clearPhotoRenderSurface=(surface:PhotoRenderSurface,r=0,g=0,b=0,a=0):void=>{for(let i=0;i<surface.pixels.data.length;i+=4){surface.pixels.data[i]=r;surface.pixels.data[i+1]=g;surface.pixels.data[i+2]=b;surface.pixels.data[i+3]=a;}};
export class PhotoCpuReferenceRenderer implements PhotoRenderer {
 readonly id='cpu-reference';
 render(frame:PhotoRenderFrame):PhotoRenderSurface{return frame.surface;}
}
