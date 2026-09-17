import type{MioAnimationProject}from'../../types/creative';
import{updateNumericKeyframe,type KeyframeRef}from'./AnimationKeyframeOperations';
export interface KeyframeDragTransaction{base:MioAnimationProject;preview:MioAnimationProject;ref:KeyframeRef;startTime:number;fps:number;duration:number}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export const snapKeyframeTime=(time:number,fps:number)=>{if(!Number.isFinite(time)||!Number.isFinite(fps)||fps<=0)throw new Error('time and fps must be finite and fps > 0');return Math.round(time*fps)/fps};
export const beginKeyframeDrag=(project:MioAnimationProject,ref:KeyframeRef):KeyframeDragTransaction=>{const track=project.tracks.find(t=>t.id===ref.trackId),key=track?.keyframes.find(k=>k.id===ref.keyId);if(!key)throw new Error('keyframe not found');return{base:project,preview:project,ref,startTime:key.time,fps:project.fps,duration:project.duration}};
export const previewKeyframeDrag=(tx:KeyframeDragTransaction,deltaSeconds:number,snap=true):KeyframeDragTransaction=>{if(!Number.isFinite(deltaSeconds))throw new Error('deltaSeconds must be finite');const raw=clamp(tx.startTime+deltaSeconds,0,tx.duration),time=snap?snapKeyframeTime(raw,tx.fps):raw;return{...tx,preview:updateNumericKeyframe(tx.base,tx.ref,{time})}};
export const commitKeyframeDrag=(tx:KeyframeDragTransaction)=>tx.preview;
export const cancelKeyframeDrag=(tx:KeyframeDragTransaction)=>tx.base;
