import type { MotionInterpolation, MotionKeyframe, MotionTrack } from "./model";

export type MotionGraphMode = "value" | "speed";

export interface MotionGraphPoint {
  keyframeId: string;
  frame: number;
  value: number;
}

export interface MotionGraphSample {
  frame: number;
  value: number;
  speed: number;
}

const componentValue = (value: number | readonly number[], component: number): number =>
  typeof value === "number" ? value : Number(value[Math.max(0, Math.min(value.length - 1, component))] ?? 0);

const cubic = (a:number,b:number,c:number,d:number,t:number):number => {
  const u=1-t;
  return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;
};

const bezierProgress = (t:number, interpolation:Extract<MotionInterpolation,{type:"bezier"}>):number => {
  let lo=0,hi=1,p=t;
  for(let i=0;i<18;i+=1){p=(lo+hi)/2;const x=cubic(0,interpolation.out[0],interpolation.in[0],1,p);if(x<t)lo=p;else hi=p;}
  return cubic(0,interpolation.out[1],interpolation.in[1],1,p);
};

export const motionGraphPoints = (track:MotionTrack, component=0):MotionGraphPoint[] =>
  [...track.keyframes].sort((a,b)=>a.frame-b.frame||a.id.localeCompare(b.id)).map(key=>({keyframeId:key.id,frame:key.frame,value:componentValue(key.value,component)}));

export const sampleMotionGraph = (track:MotionTrack, startFrame:number, endFrame:number, component=0, step=1):MotionGraphSample[] => {
  const keys=[...track.keyframes].sort((a,b)=>a.frame-b.frame||a.id.localeCompare(b.id));
  const evaluate=(frame:number):number=>{
    if(!keys.length)return componentValue(track.defaultValue,component);
    if(frame<=keys[0].frame)return componentValue(keys[0].value,component);
    if(frame>=keys[keys.length-1].frame)return componentValue(keys[keys.length-1].value,component);
    const ri=keys.findIndex(key=>key.frame>frame),left=keys[ri-1],right=keys[ri];
    if(left.interpolation.type==="hold")return componentValue(left.value,component);
    const span=Math.max(1,right.frame-left.frame);let t=(frame-left.frame)/span;
    if(left.interpolation.type==="bezier")t=bezierProgress(t,left.interpolation);
    const a=componentValue(left.value,component),b=componentValue(right.value,component);
    return a+(b-a)*t;
  };
  const samples:MotionGraphSample[]=[];
  const lo=Math.round(Math.min(startFrame,endFrame)),hi=Math.round(Math.max(startFrame,endFrame)),stride=Math.max(1,Math.round(step));
  for(let frame=lo;frame<=hi;frame+=stride){const value=evaluate(frame);const prev=evaluate(Math.max(lo,frame-stride));const next=evaluate(Math.min(hi,frame+stride));const distance=Math.max(1,Math.min(hi,frame+stride)-Math.max(lo,frame-stride));samples.push({frame,value,speed:(next-prev)/distance});}
  return samples;
};

export const setMotionBezierHandles = (
  keyframe:MotionKeyframe,
  outHandle:readonly [number,number],
  inHandle:readonly [number,number],
):MotionKeyframe => ({
  ...keyframe,
  interpolation:{type:"bezier",out:[Math.max(0,Math.min(1,outHandle[0])),outHandle[1]],in:[Math.max(0,Math.min(1,inHandle[0])),inHandle[1]]},
});

export const graphValueRange = (samples:readonly MotionGraphSample[], mode:MotionGraphMode):readonly [number,number] => {
  const values=samples.map(sample=>mode==="value"?sample.value:sample.speed);
  if(!values.length)return [0,1];
  const min=Math.min(...values),max=Math.max(...values);
  if(min===max){const pad=Math.max(1,Math.abs(min)*.1);return [min-pad,max+pad];}
  const pad=(max-min)*.1;return [min-pad,max+pad];
};
