export interface SFXSampleAsset {
  id:string; name:string; sampleRate:number; channels:number; lengthSamples:number;
  sourceUri?:string; contentHash?:string; version?:number;
}
export interface SFXSampleRegion {
  id:string; assetId:string; name:string; sourceStart:number; sourceEnd:number; timelineStart:number;
  gain:number; pan:number; fadeIn:number; fadeOut:number; reverse:boolean;
  playbackRate:number; pitchSemitones:number; loop:boolean; loopStart?:number; loopEnd?:number;
}
export interface SFXWaveformPeak { min:number; max:number; }
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
export const assetDuration=(a:SFXSampleAsset)=>a.lengthSamples/Math.max(1,a.sampleRate);
export const sanitizeSampleAsset=(a:SFXSampleAsset):SFXSampleAsset=>({...a,sampleRate:clamp(Math.round(a.sampleRate),8000,384000),channels:clamp(Math.round(a.channels),1,32),lengthSamples:Math.max(1,Math.round(a.lengthSamples)),version:Math.max(1,Math.round(a.version??1))});
export const effectivePlaybackRate=(r:SFXSampleRegion)=>clamp(r.playbackRate,0.0625,16)*Math.pow(2,clamp(r.pitchSemitones,-48,48)/12);
export const regionTimelineDuration=(r:SFXSampleRegion)=>Math.max(.001,r.sourceEnd-r.sourceStart)/effectivePlaybackRate(r);
export const normalizeSampleRegion=(r:SFXSampleRegion,a:SFXSampleAsset):SFXSampleRegion=>{
 const d=assetDuration(a),sourceStart=clamp(r.sourceStart,0,Math.max(0,d-.001)),sourceEnd=clamp(r.sourceEnd,sourceStart+.001,d),sourceDuration=sourceEnd-sourceStart;
 let fadeIn=clamp(r.fadeIn,0,sourceDuration),fadeOut=clamp(r.fadeOut,0,sourceDuration); const fadeTotal=fadeIn+fadeOut;
 if(fadeTotal>sourceDuration){const scale=sourceDuration/fadeTotal;fadeIn*=scale;fadeOut*=scale;}
 const loopStart=clamp(r.loopStart??sourceStart,sourceStart,sourceEnd-.001),loopEnd=clamp(r.loopEnd??sourceEnd,loopStart+.001,sourceEnd);
 return {...r,sourceStart,sourceEnd,timelineStart:Math.max(0,r.timelineStart),gain:clamp(r.gain,0,4),pan:clamp(r.pan,-1,1),fadeIn,fadeOut,reverse:Boolean(r.reverse),playbackRate:clamp(r.playbackRate||1,.0625,16),pitchSemitones:clamp(r.pitchSemitones||0,-48,48),loop:Boolean(r.loop),loopStart,loopEnd};
};
export const trimSampleRegion=(r:SFXSampleRegion,a:SFXSampleAsset,start:number,end:number)=>normalizeSampleRegion({...r,sourceStart:start,sourceEnd:end},a);
export const moveSampleRegion=(r:SFXSampleRegion,timelineStart:number):SFXSampleRegion=>({...r,timelineStart:Math.max(0,timelineStart)});
export const splitSampleRegion=(r:SFXSampleRegion,a:SFXSampleAsset,offset:number,leftId:string,rightId:string):[SFXSampleRegion,SFXSampleRegion]|null=>{
 const n=normalizeSampleRegion(r,a),duration=n.sourceEnd-n.sourceStart;if(offset<=.001||offset>=duration-.001)return null;
 const splitSource=n.reverse?n.sourceEnd-offset:n.sourceStart+offset,boundary=clamp(splitSource,n.sourceStart+.001,n.sourceEnd-.001);
 const left=normalizeSampleRegion({...n,id:leftId,name:`${n.name} A`,sourceEnd:boundary,fadeOut:0,loop:false},a);
 const right=normalizeSampleRegion({...n,id:rightId,name:`${n.name} B`,sourceStart:boundary,timelineStart:n.timelineStart+offset/effectivePlaybackRate(n),fadeIn:0,loop:false},a);
 return [left,right];
};
export const regionGainAt=(r:SFXSampleRegion,localTime:number)=>{
 const duration=Math.max(.001,regionTimelineDuration(r)),t=clamp(localTime,0,duration),rate=effectivePlaybackRate(r);
 const fadeIn=r.fadeIn>0?clamp((t*rate)/r.fadeIn,0,1):1,fadeOut=r.fadeOut>0?clamp(((duration-t)*rate)/r.fadeOut,0,1):1;
 return r.gain*Math.min(fadeIn,fadeOut);
};
export const buildWaveformPeaks=(samples:Float32Array,buckets:number):SFXWaveformPeak[]=>{
 const count=clamp(Math.round(buckets),1,Math.max(1,samples.length)),peaks:SFXWaveformPeak[]=[];
 for(let b=0;b<count;b++){const start=Math.floor(b*samples.length/count),end=Math.max(start+1,Math.floor((b+1)*samples.length/count));let min=1,max=-1;
 for(let i=start;i<Math.min(end,samples.length);i++){const v=clamp(samples[i],-1,1);min=Math.min(min,v);max=Math.max(max,v);}peaks.push({min:min===1&&max===-1?0:min,max:min===1&&max===-1?0:max});}return peaks;
};
