import { applyDrawingPressure, normalizeDrawingBrushSettings, resampleDrawingPoints, sampleDrawingBrush, smoothDrawingPoints } from '../creative/drawing/DrawingBrushEngine';
import { getDrawingBrushPreset, listDrawingBrushPresets } from '../creative/drawing/DrawingBrushRegistry';
import { DrawingBrushRuntime } from '../creative/drawing/DrawingBrushRuntime';
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
export function runCreativeDrawingBrushEngineTests(){
 const s=normalizeDrawingBrushSettings({size:10,opacity:1,spacing:.2,smoothing:0,pressureSize:1,pressureOpacity:1,pressureCurve:1});
 assert(applyDrawingPressure(.5,1)===.5&&applyDrawingPressure(.5,1,2)===.25,'pressure curve failed');
 const line=[{x:0,y:0,pressure:1},{x:10,y:0,pressure:.5}];const spaced=resampleDrawingPoints(line,2);assert(spaced.length===6&&spaced[1].x===2,'spacing failed');
 const stroke={id:'b',points:[{x:0,y:0,pressure:1},{x:10,y:10,pressure:.5},{x:20,y:0,pressure:1}],color:'#000',size:10,opacity:1,blendMode:'normal' as const};
 const samples=sampleDrawingBrush(stroke,s);assert(samples[0].radius===5&&samples[samples.length-1].radius===5,'sample dynamics failed');
 assert(smoothDrawingPoints(stroke.points,1)[1].y<10,'smoothing failed');
 const presets=listDrawingBrushPresets();presets[0].name='mutated';assert(getDrawingBrushPreset('mio-pencil')?.name==='Mio Pencil'&&presets.length===4,'preset immutability failed');
 const runtime=new DrawingBrushRuntime();const preview=runtime.updateTransient(stroke,s);assert(preview.samples.length>0&&runtime.getTransient()?.strokeId==='b','transient preview failed');runtime.clearTransient();assert(runtime.getTransient()===null,'transient clear failed');
 return {passed:7,total:7};
}