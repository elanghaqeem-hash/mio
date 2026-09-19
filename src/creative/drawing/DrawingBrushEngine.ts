import type { DrawingPoint, DrawingStroke } from '../../types/creative';

export interface DrawingBrushSettings { size:number; opacity:number; spacing:number; smoothing:number; pressureSize:number; pressureOpacity:number; }
export interface DrawingBrushSample { x:number; y:number; radius:number; opacity:number; }
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
const finite=(v:number,f:number)=>Number.isFinite(v)?v:f;
export const normalizeDrawingBrushSettings=(settings:DrawingBrushSettings):DrawingBrushSettings=>({size:clamp(finite(settings.size,8),0.5,1000),opacity:clamp(finite(settings.opacity,1),0,1),spacing:clamp(finite(settings.spacing,.15),.01,1),smoothing:clamp(finite(settings.smoothing,0),0,1),pressureSize:clamp(finite(settings.pressureSize,1),0,1),pressureOpacity:clamp(finite(settings.pressureOpacity,0),0,1)});
export const sampleDrawingBrush=(stroke:DrawingStroke,settings:DrawingBrushSettings):DrawingBrushSample[]=>{const s=normalizeDrawingBrushSettings(settings);return stroke.points.map((p:DrawingPoint)=>({x:p.x,y:p.y,radius:Math.max(.5,(s.size*(1-s.pressureSize)+s.size*s.pressureSize*clamp(p.pressure,0,1))/2),opacity:clamp(s.opacity*(1-s.pressureOpacity)+s.opacity*s.pressureOpacity*clamp(p.pressure,0,1),0,1)}));};
