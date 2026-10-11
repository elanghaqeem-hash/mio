import type { DrawingPoint, DrawingStroke } from '../../types/creative';

export interface DrawingBrushSettings { size:number; opacity:number; spacing:number; smoothing:number; pressureSize:number; pressureOpacity:number; pressureCurve?:number; }
export interface DrawingBrushSample { x:number;y:number;radius:number;opacity:number; }
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const finite=(v:number,f:number)=>Number.isFinite(v)?v:f;

export const normalizeDrawingBrushSettings=(s:DrawingBrushSettings):DrawingBrushSettings=>({
 size:clamp(finite(s.size,8),.5,1000), opacity:clamp(finite(s.opacity,1),0,1),
 spacing:clamp(finite(s.spacing,.15),.01,1), smoothing:clamp(finite(s.smoothing,0),0,1),
 pressureSize:clamp(finite(s.pressureSize,1),0,1), pressureOpacity:clamp(finite(s.pressureOpacity,0),0,1),
 pressureCurve:clamp(finite(s.pressureCurve??1,1),.25,4),
});
export const applyDrawingPressure=(pressure:number,amount:number,curve=1)=>{const p=Math.pow(clamp(finite(pressure,1),0,1),clamp(finite(curve,1),.25,4));const a=clamp(finite(amount,0),0,1);return 1-a+a*p;};
export const smoothDrawingPoints=(points:DrawingPoint[],amount:number):DrawingPoint[]=>{const a=clamp(finite(amount,0),0,1);if(a===0||points.length<3)return points.map(p=>({...p}));return points.map((p,i)=>i===0||i===points.length-1?{...p}:{x:p.x*(1-a)+(points[i-1].x+p.x+points[i+1].x)/3*a,y:p.y*(1-a)+(points[i-1].y+p.y+points[i+1].y)/3*a,pressure:p.pressure});};

export const resampleDrawingPoints=(points:DrawingPoint[],distance:number):DrawingPoint[]=>{
 if(points.length<2)return points.map(p=>({...p})); const step=Math.max(.01,finite(distance,1)); const out:DrawingPoint[]=[{...points[0]}]; let carry=0;
 for(let i=1;i<points.length;i++){let a={...points[i-1]},b=points[i];let dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!Number.isFinite(len)||len===0)continue;
  while(carry+len>=step){const t=(step-carry)/len;a={x:a.x+dx*t,y:a.y+dy*t,pressure:a.pressure+(b.pressure-a.pressure)*t};out.push(a);dx=b.x-a.x;dy=b.y-a.y;len=Math.hypot(dx,dy);carry=0;}
  carry+=len;
 }
 const last=points[points.length-1],tail=out[out.length-1];if(tail.x!==last.x||tail.y!==last.y)out.push({...last});return out;
};
export const sampleDrawingBrush=(stroke:DrawingStroke,settings:DrawingBrushSettings):DrawingBrushSample[]=>{const s=normalizeDrawingBrushSettings(settings);const smoothed=smoothDrawingPoints(stroke.points,s.smoothing);const points=resampleDrawingPoints(smoothed,Math.max(.5,s.size*s.spacing));return points.map(p=>({x:p.x,y:p.y,radius:Math.max(.5,s.size*applyDrawingPressure(p.pressure,s.pressureSize,s.pressureCurve)/2),opacity:clamp(s.opacity*applyDrawingPressure(p.pressure,s.pressureOpacity,s.pressureCurve),0,1)}));};
