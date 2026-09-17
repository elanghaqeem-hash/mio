import type{MioAnimationProject}from'../../types/creative';
import{updateNumericKeyframe,type KeyframeRef}from'./AnimationKeyframeOperations';
export interface KeyframeDragTransaction{base:MioAnimationProject;preview:MioAnimationProject;ref:KeyframeRef;startTime:number;startValue:number;fps:number;duration:number}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export const snapKeyframeTime=(time:number,fps:number)=>{if(!Number.isFinite(time)||!Number.isFinite(fps)||fps<=0)throw new Error('time and fps must be finite and fps > 0');return Math.round(time*fps)/fps};
export const beginKeyframeDrag=(project:MioAnimationProject,ref:KeyframeRef):KeyframeDragTransaction=>{const track=project.tracks.find(t=>t.id===ref.trackId),key=track?.keyframes.find(k=>k.id===ref.keyId);if(!key)throw new Error('keyframe not found');const value=Number(key.value);if(!Number.isFinite(value))throw new Error('keyframe value must be numeric');return{base:project,preview:project,ref,startTime:key.time,startValue:value,fps:project.fps,duration:project.duration}};
export const previewKeyframeDrag=(tx:KeyframeDragTransaction,deltaSeconds:number,snap=true,deltaValue=0):KeyframeDragTransaction=>{if(!Number.isFinite(deltaSeconds)||!Number.isFinite(deltaValue))throw new Error('drag deltas must be finite');const raw=clamp(tx.startTime+deltaSeconds,0,tx.duration),time=snap?snapKeyframeTime(raw,tx.fps):raw;return{...tx,preview:updateNumericKeyframe(tx.base,tx.ref,{time,value:tx.startValue+deltaValue})}};
export const commitKeyframeDrag=(tx:KeyframeDragTransaction)=>tx.preview;
export const cancelKeyframeDrag=(tx:KeyframeDragTransaction)=>tx.base;
