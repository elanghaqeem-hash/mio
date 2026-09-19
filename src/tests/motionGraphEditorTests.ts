import { graphValueRange, motionGraphPoints, sampleMotionGraph, setMotionBezierHandles } from "../creative/motion/graphEditor";
import type { MotionTrack } from "../creative/motion/model";

const assert=(ok:unknown,message:string):void=>{if(!ok)throw new Error(`Motion graph editor test failed: ${message}`)};

export function runMotionGraphEditorTests():void{
  const track:MotionTrack<number>={id:"x",property:"x",defaultValue:0,keyframes:[
    {id:"a",frame:0,value:0,interpolation:{type:"linear"}},
    {id:"b",frame:10,value:100,interpolation:{type:"linear"}},
  ]};
  const points=motionGraphPoints(track);
  assert(points.length===2&&points[1].value===100,"graph points");
  const samples=sampleMotionGraph(track,0,10,0,5);
  assert(samples.map(s=>s.value).join(",")==="0,50,100","linear sampling");
  assert(Math.abs(samples[1].speed-10)<.001,"speed graph sampling");
  const range=graphValueRange(samples,"value");
  assert(range[0]<0&&range[1]>100,"value range padding");
  const edited=setMotionBezierHandles(track.keyframes[0],[1.5,-.2],[-.5,1.2]);
  assert(edited.interpolation.type==="bezier","bezier conversion");
  if(edited.interpolation.type==="bezier")assert(edited.interpolation.out[0]===1&&edited.interpolation.in[0]===0,"temporal handle x clamp");
  const hold:MotionTrack<number>={...track,keyframes:[{...track.keyframes[0],interpolation:{type:"hold"}},track.keyframes[1]]};
  assert(sampleMotionGraph(hold,0,10,0,5)[1].value===0,"hold graph sampling");
}
