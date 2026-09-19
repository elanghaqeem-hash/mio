import { assetDuration, buildWaveformPeaks, type SFXSampleAsset, type SFXSampleRegion, type SFXWaveformPeak } from './SFXSampleWorkspace';
import { decodeSFXSample, type SFXDecodedSample } from './SFXSampleRuntime';
export interface SFXWaveformLevel { buckets:number; channels:SFXWaveformPeak[][]; }
export interface SFXRuntimeSampleEntry { decoded:SFXDecodedSample; waveform:SFXWaveformLevel[]; }
const registry=new Map<string,SFXRuntimeSampleEntry>();
export const buildWaveformPyramid=(buffer:AudioBuffer,levels=[128,512,2048]):SFXWaveformLevel[]=>levels.filter(buckets=>Number.isFinite(buckets)&&buckets>0).map(buckets=>{const channels=Array.from({length:buffer.numberOfChannels},(_,channel)=>buildWaveformPeaks(buffer.getChannelData(channel),Math.min(Math.max(1,Math.round(buckets)),buffer.length)));return{buckets:channels[0]?.length??0,channels};}).filter(level=>level.buckets>0);
export const registerDecodedSample=(decoded:SFXDecodedSample):SFXRuntimeSampleEntry=>{const entry={decoded,waveform:buildWaveformPyramid(decoded.buffer)};registry.set(decoded.asset.id,entry);return entry;};
export const sampleAssetCompatible=(asset:SFXSampleAsset,candidate:SFXSampleAsset):boolean=>{if(asset.channels!==candidate.channels)return false;if(asset.contentHash&&candidate.contentHash&&asset.contentHash!==candidate.contentHash)return false;const expected=assetDuration(asset),actual=assetDuration(candidate),tolerance=Math.max(.002,expected*.001);return Math.abs(expected-actual)<=tolerance;};
export const relinkSFXSample=async(context:BaseAudioContext,file:File,asset:SFXSampleAsset):Promise<SFXRuntimeSampleEntry>=>{const decoded=await decodeSFXSample(context,await file.arrayBuffer(),asset.id,asset.name,asset.sourceUri);if(!sampleAssetCompatible(asset,decoded.asset))throw new Error(`Relinked sample does not match asset ${asset.name}`);decoded.asset={...asset,sampleRate:decoded.buffer.sampleRate,channels:decoded.buffer.numberOfChannels,lengthSamples:decoded.buffer.length};return registerDecodedSample(decoded);};
export const importSFXSample=async(context:BaseAudioContext,file:File,id:string):Promise<{asset:SFXSampleAsset;region:SFXSampleRegion;entry:SFXRuntimeSampleEntry}>=>{
 const decoded=await decodeSFXSample(context,await file.arrayBuffer(),id,file.name);const entry=registerDecodedSample(decoded),duration=decoded.buffer.duration;
 return{asset:decoded.asset,entry,region:{id:`region_${id}`,assetId:id,name:file.name,sourceStart:0,sourceEnd:duration,timelineStart:0,gain:1,pan:0,fadeIn:Math.min(.01,duration/4),fadeOut:Math.min(.01,duration/4),reverse:false,playbackRate:1,pitchSemitones:0,loop:false}};
};
export const getRuntimeSample=(assetId:string)=>registry.get(assetId);
export const hasRuntimeSample=(assetId:string):boolean=>registry.has(assetId);
export const releaseRuntimeSample=(assetId:string)=>registry.delete(assetId);
export const clearSFXRuntimeSamples=()=>registry.clear();
export const chooseWaveformLevel=(entry:SFXRuntimeSampleEntry,pixels:number):SFXWaveformLevel|undefined=>{if(!entry.waveform.length)return undefined;const target=Math.max(1,Number.isFinite(pixels)?pixels:1);return entry.waveform.reduce((best,level)=>Math.abs(level.buckets-target)<Math.abs(best.buckets-target)?level:best);};
