import type{AnimationInterpolation,Keyframe,MioAnimationProject}from'../../types/creative';
export interface KeyframeRef{trackId:string;keyId:string}
const finite=(n:number,name:string)=>{if(!Number.isFinite(n))throw new Error(`${name} must be finite`);return n};
let keySequence=0;
const createKeyId=(trackId:string,time:number)=>`key_${trackId}_${Math.round(time*1000000)}_${++keySequence}`;
export const ensureStableKeyframeIds=(project:MioAnimationProject):MioAnimationProject=>({...project,tracks:project.tracks.map(t=>({...t,keyframes:t.keyframes.map((k,i)=>k.id?k:{...k,id:`key_${t.id}_legacy_${i}`})}))});
const findKey=(keys:Keyframe[],id:string)=>keys.findIndex(k=>k.id===id);
export const insertNumericKeyframe=(project:MioAnimationProject,trackId:string,time:number,value:number,interpolation:AnimationInterpolation='easeInOut'):MioAnimationProject=>{finite(time,'time');finite(value,'value');const clamped=Math.max(0,Math.min(project.duration,time));return{...project,tracks:project.tracks.map(t=>t.id!==trackId?t:{...t,keyframes:[...t.keyframes,{id:createKeyId(trackId,clamped),time:clamped,value,interpolation}].sort((a,b)=>a.time-b.time)})}};
export const updateNumericKeyframe=(project:MioAnimationProject,ref:KeyframeRef,changes:{time?:number;value?:number;interpolation?:AnimationInterpolation}):MioAnimationProject=>({...project,tracks:project.tracks.map(t=>{if(t.id!==ref.trackId)return t;const index=findKey(t.keyframes,ref.keyId);if(index<0)return t;return{...t,keyframes:t.keyframes.map((k,i)=>i!==index?k:{...k,...changes,time:changes.time===undefined?k.time:Math.max(0,Math.min(project.duration,finite(changes.time,'time'))),value:changes.value===undefined?k.value:finite(changes.value,'value')}).sort((a,b)=>a.time-b.time)}})});
export const deleteKeyframe=(project:MioAnimationProject,ref:KeyframeRef):MioAnimationProject=>({...project,tracks:project.tracks.map(t=>t.id!==ref.trackId?t:{...t,keyframes:t.keyframes.filter(k=>k.id!==ref.keyId)})});
