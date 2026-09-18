import { effectivePlaybackRate, normalizeSampleRegion, regionTimelineDuration, type SFXSampleAsset, type SFXSampleRegion } from './SFXSampleWorkspace';

export interface SFXDecodedSample { asset:SFXSampleAsset; buffer:AudioBuffer; }
export interface SFXScheduledSample { source:AudioBufferSourceNode; gain:GainNode; pan:StereoPannerNode; stopTime:number; disconnect:()=>void; }
export const decodeSFXSample=async(context:BaseAudioContext,data:ArrayBuffer,id:string,name:string,sourceUri?:string):Promise<SFXDecodedSample>=>{
 const buffer=await context.decodeAudioData(data.slice(0));
 return {buffer,asset:{id,name,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,lengthSamples:buffer.length,sourceUri,version:1}};
};
export const reverseAudioBuffer=(context:BaseAudioContext,input:AudioBuffer):AudioBuffer=>{
 const output=context.createBuffer(input.numberOfChannels,input.length,input.sampleRate);
 for(let channel=0;channel<input.numberOfChannels;channel++){const src=input.getChannelData(channel),dst=output.getChannelData(channel);for(let i=0;i<src.length;i++)dst[i]=src[src.length-1-i];}
 return output;
};
export const scheduleSFXSampleRegion=(context:BaseAudioContext,decoded:SFXDecodedSample,region:SFXSampleRegion,destination:AudioNode,when=context.currentTime):SFXScheduledSample=>{
 if(decoded.asset.id!==region.assetId)throw new Error('SFX sample asset/region mismatch');
 const r=normalizeSampleRegion(region,decoded.asset),source=context.createBufferSource(),gain=context.createGain(),pan=context.createStereoPanner();
 source.buffer=r.reverse?reverseAudioBuffer(context,decoded.buffer):decoded.buffer;source.playbackRate.setValueAtTime(effectivePlaybackRate(r),when);
 source.loop=r.loop;if(r.loop){source.loopStart=r.reverse?Math.max(0,decoded.buffer.duration-(r.loopEnd??r.sourceEnd)):(r.loopStart??r.sourceStart);source.loopEnd=r.reverse?Math.max(source.loopStart+.001,decoded.buffer.duration-(r.loopStart??r.sourceStart)):(r.loopEnd??r.sourceEnd);}
 pan.pan.setValueAtTime(r.pan,when);source.connect(gain).connect(pan).connect(destination);
 const duration=regionTimelineDuration(r),rate=effectivePlaybackRate(r),fadeIn=r.fadeIn/rate,fadeOut=r.fadeOut/rate;if(duration<=0)throw new Error('SFX sample region duration must be positive');
 gain.gain.setValueAtTime(fadeIn>0?0:r.gain,when);if(fadeIn>0)gain.gain.linearRampToValueAtTime(r.gain,when+fadeIn);
 if(fadeOut>0){gain.gain.setValueAtTime(r.gain,Math.max(when+fadeIn,when+duration-fadeOut));gain.gain.linearRampToValueAtTime(0,when+duration);}
 const offset=r.reverse?decoded.buffer.duration-r.sourceEnd:r.sourceStart;source.start(when,Math.max(0,offset));source.stop(when+duration);
 const disconnect=()=>{try{source.disconnect();}catch{}try{gain.disconnect();}catch{}try{pan.disconnect();}catch{}};source.addEventListener('ended',disconnect,{once:true});
 return {source,gain,pan,stopTime:when+duration,disconnect};
};
