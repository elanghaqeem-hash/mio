import type { PhotoPixelBuffer } from './PhotoRenderer';
import type { PhotoTransform } from './PhotoDocumentModel';
export type PhotoSamplingMode='nearest'|'bilinear';
const px=(src:PhotoPixelBuffer,x:number,y:number,c:number)=>{if(x<0||y<0||x>=src.width||y>=src.height)return 0;return src.data[(y*src.width+x)*4+c];};
export const samplePhotoPixel=(src:PhotoPixelBuffer,x:number,y:number,mode:PhotoSamplingMode='bilinear'):[number,number,number,number]=>{
 if(mode==='nearest'){const ix=Math.round(x),iy=Math.round(y);return [px(src,ix,iy,0),px(src,ix,iy,1),px(src,ix,iy,2),px(src,ix,iy,3)];}
 const x0=Math.floor(x),y0=Math.floor(y),x1=x0+1,y1=y0+1,fx=x-x0,fy=y-y0,out=[0,0,0,0] as [number,number,number,number];
 for(let c=0;c<4;c++){const a=px(src,x0,y0,c)*(1-fx)+px(src,x1,y0,c)*fx,b=px(src,x0,y1,c)*(1-fx)+px(src,x1,y1,c)*fx;out[c]=Math.round(a*(1-fy)+b*fy);}return out;
};
export interface PhotoTransformPivot {x:number;y:number;}
export const inverseMapPhotoPoint=(x:number,y:number,t:PhotoTransform,pivot:PhotoTransformPivot={x:0,y:0}):{x:number;y:number}=>{if(t.scaleX===0||t.scaleY===0)throw new Error('Photo transform scale cannot be zero.');const dx=x-t.x-pivot.x,dy=y-t.y-pivot.y,rad=-t.rotation*Math.PI/180,cr=Math.cos(rad),sr=Math.sin(rad),rx=dx*cr-dy*sr,ry=dx*sr+dy*cr;const kx=Math.tan(t.skewX*Math.PI/180),ky=Math.tan(t.skewY*Math.PI/180),det=1-kx*ky;if(Math.abs(det)<1e-8)throw new Error('Photo transform skew is singular.');const ux=(rx-kx*ry)/det,uy=(ry-ky*rx)/det;return {x:ux/t.scaleX+pivot.x,y:uy/t.scaleY+pivot.y};};
export const transformPhotoBuffer=(src:PhotoPixelBuffer,width:number,height:number,t:PhotoTransform,mode:PhotoSamplingMode='bilinear',pivot:PhotoTransformPivot={x:0,y:0}):PhotoPixelBuffer=>{if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('Transformed buffer dimensions must be positive integers.');const data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=inverseMapPhotoPoint(x,y,t,pivot),v=samplePhotoPixel(src,p.x,p.y,mode),i=(y*width+x)*4;data.set(v,i);}return {width,height,data};};
