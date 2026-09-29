export type VideoSampleReason='START'|'INTERVAL'|'END'|'SCENE_CANDIDATE';
export interface VideoSamplePoint{timestampSeconds:number;reason:VideoSampleReason;}
export interface VideoSamplingPlan{
 durationSeconds:number;points:VideoSamplePoint[];maxSamples:number;strategy:'UNIFORM_BOUNDED';analyzerVersion:'mio-video-sampling-v1';
}
export interface VideoSamplingOptions{maxSamples?:number;includeEnd?:boolean;}
const round=(n:number)=>Math.round(n*1000)/1000;
export function planVideoSampling(durationSeconds:number,options:VideoSamplingOptions={}):VideoSamplingPlan{
 if(!Number.isFinite(durationSeconds)||durationSeconds<=0)throw new Error('Video duration must be finite and positive');
 const maxSamples=options.maxSamples??12;
 if(!Number.isSafeInteger(maxSamples)||maxSamples<1||maxSamples>120)throw new Error('Video sampling budget must be between 1 and 120');
 const includeEnd=options.includeEnd??true;
 const count=Math.min(maxSamples,Math.max(1,Math.ceil(durationSeconds/10)+1));
 const timestamps:number[]=[];
 if(count===1)timestamps.push(0);
 else for(let i=0;i<count;i+=1)timestamps.push(round(durationSeconds*i/(count-1)));
 if(!includeEnd&&timestamps.length>1&&timestamps[timestamps.length-1]===round(durationSeconds))timestamps.pop();
 const points=timestamps.map((timestampSeconds,index):VideoSamplePoint=>({timestampSeconds,reason:index===0?'START':timestampSeconds===round(durationSeconds)?'END':'INTERVAL'}));
 return {durationSeconds,points,maxSamples,strategy:'UNIFORM_BOUNDED',analyzerVersion:'mio-video-sampling-v1'};
}
export function mergeSceneCandidates(plan:VideoSamplingPlan,candidates:readonly number[]):VideoSamplingPlan{
 const values=new Map<number,VideoSampleReason>(plan.points.map(p=>[p.timestampSeconds,p.reason]));
 for(const raw of candidates){if(!Number.isFinite(raw)||raw<0||raw>plan.durationSeconds)continue;values.set(round(raw),'SCENE_CANDIDATE');}
 const selected=[...values.entries()].sort((a,b)=>a[0]-b[0]).slice(0,plan.maxSamples).map(([timestampSeconds,reason])=>({timestampSeconds,reason}));
 return {...plan,points:selected};
}
