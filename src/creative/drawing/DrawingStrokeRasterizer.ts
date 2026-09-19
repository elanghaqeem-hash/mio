import type { DrawingPoint, DrawingStroke } from '../../types/creative';
export interface RasterCircle { x:number; y:number; radius:number; opacity:number; }
export interface RasterStroke { id:string; color:string; blendMode:DrawingStroke['blendMode']; circles:RasterCircle[]; }
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
export const rasterizeDrawingStroke=(stroke:DrawingStroke):RasterStroke=>({id:stroke.id,color:stroke.color,blendMode:stroke.blendMode,circles:stroke.points.map((point:DrawingPoint)=>({x:point.x,y:point.y,radius:Math.max(0.5,stroke.size*clamp(point.pressure,0,1)/2),opacity:stroke.opacity}))});
