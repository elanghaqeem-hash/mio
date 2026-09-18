import { buildWaveformPeaks, type SFXSampleAsset, type SFXSampleRegion, type SFXWaveformPeak } from './SFXSampleWorkspace';
import { decodeSFXSample, type SFXDecodedSample } from './SFXSampleRuntime';
export interface SFXWaveformLevel { buckets:number; channels:SFXWaveformPeak[][]; }
export interface SFXRuntimeSampleEntry { decoded:SFXDecodedSample; waveform:SFXWaveformLevel[]; }
const registry=new Map<string,SFXRuntimeSampleEntry>();
export const buildWaveformPyramid=(buffer:AudioBuffer,levels=[128,512,2048]):SFXWaveformLevel[]=>levels.map(buckets=>({buckets,channels:Array.from({length:buffer.numberOfChannels},(_,channel)=>buildWaveformPeaks(buffer.getChannelData(channel),Math.min(buckets,buffer.length)))}));
export const registerDecodedSample=(decoded:SFXDecodedSample):SFXRuntimeSampleEntry=>{const entry={decoded,waveform:buildWaveformPyramid(decoded.buffer)};registry.set(decoded.asset.id,entry);return entry;};
export const importSFXSample=async(context:BaseAudioContext,file:File,id:string):Promise<{asset:SFXSampleAsset;region:SFXSampleRegion;entry:SFXRuntimeSampleEntry}>=>{
 const decoded=await decodeSFXSample(context,await file.arrayBuffer(),id,file.name);const entry=registerDecodedSample(decoded),duration=decoded.buffer.duration;
 return{asset:decoded.asset,entry,region:{id:`region_${id}`,assetId:id,name:file.name,sourceStart:0,sourceEnd:duration,timelineStart:0,gain:1,pan:0,fadeIn:Math.min(.01,duration/4),fadeOut:Math.min(.01,duration/4),reverse:false,playbackRate:1,pitchSemitones:0,loop:false}};
};
export const getRuntimeSample=(assetId:string)=>registry.get(assetId);
export const releaseRuntimeSample=(assetId:string)=>registry.delete(assetId);
export const clearSFXRuntimeSamples=()=>registry.clear();
export const chooseWaveformLevel=(entry:SFXRuntimeSampleEntry,pixels:number)=>entry.waveform.reduce((best,level)=>Math.abs(level.buckets-pixels)<Math.abs(best.buckets-pixels)?level:best,entry.waveform[0]);
