import type { DrawingPoint, DrawingStroke } from '../../types/creative';
export interface DrawingBrushSettings { size:number; opacity:number; spacing:number; smoothing:number; pressureSize:number; pressureOpacity:number; }
export interface DrawingBrushSample { x:number;y:number;radius:number;opacity:number; }
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const finite=(v:number,f:number)=>Number.isFinite(v)?v:f;
export const normalizeDrawingBrushSettings=(s:DrawingBrushSettings):DrawingBrushSettings=>({size:clamp(finite(s.size,8),.5,1000),opacity:clamp(finite(s.opacity,1),0,1),spacing:clamp(finite(s.spacing,.15),.01,1),smoothing:clamp(finite(s.smoothing,0),0,1),pressureSize:clamp(finite(s.pressureSize,1),0,1),pressureOpacity:clamp(finite(s.pressureOpacity,0),0,1)});
export const applyDrawingPressure=(pressure:number,amount:number)=>1-clamp(amount,0,1)+clamp(amount,0,1)*clamp(finite(pressure,1),0,1);
export const smoothDrawingPoints=(points:DrawingPoint[],amount:number):DrawingPoint[]=>{const a=clamp(finite(amount,0),0,1);if(a===0||points.length<3)return points.map(p=>({...p}));return points.map((p,i)=>i===0||i===points.length-1?{...p}:{x:p.x*(1-a)+(points[i-1].x+p.x+points[i+1].x)/3*a,y:p.y*(1-a)+(points[i-1].y+p.y+points[i+1].y)/3*a,pressure:p.pressure});};
export const sampleDrawingBrush=(stroke:DrawingStroke,settings:DrawingBrushSettings):DrawingBrushSample[]=>{const s=normalizeDrawingBrushSettings(settings);return smoothDrawingPoints(stroke.points,s.smoothing).map(p=>({x:p.x,y:p.y,radius:Math.max(.5,s.size*applyDrawingPressure(p.pressure,s.pressureSize)/2),opacity:clamp(s.opacity*applyDrawingPressure(p.pressure,s.pressureOpacity),0,1)}));};
