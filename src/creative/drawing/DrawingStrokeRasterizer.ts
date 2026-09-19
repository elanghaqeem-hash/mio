import type { DrawingPoint, DrawingStroke } from '../../types/creative';

export interface RasterCircle { x:number; y:number; radius:number; opacity:number; }
export interface RasterStroke { id:string; color:string; blendMode:DrawingStroke['blendMode']; circles:RasterCircle[]; }

const clamp=(value:number,min:number,max:number):number=>Math.min(max,Math.max(min,value));
const finite=(value:number,fallback:number):number=>Number.isFinite(value)?value:fallback;

/** Deterministic reference rasterization model. Rendering is pure; it never mutates document state. */
export const rasterizeDrawingStroke=(stroke:DrawingStroke):RasterStroke=>{
  const size=clamp(finite(stroke.size,1),0.5,1000);
  const opacity=clamp(finite(stroke.opacity,1),0,1);
  return {
    id:stroke.id,
    color:stroke.color,
    blendMode:stroke.blendMode,
    circles:stroke.points.map((point:DrawingPoint)=>({
      x:finite(point.x,0),
      y:finite(point.y,0),
      radius:Math.max(0.5,size*clamp(finite(point.pressure,1),0,1)/2),
      opacity,
    })),
  };
};
