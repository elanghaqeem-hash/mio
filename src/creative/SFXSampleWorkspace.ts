export interface SFXSampleAsset {
  id: string;
  name: string;
  sampleRate: number;
  channels: number;
  lengthSamples: number;
  sourceUri?: string;
}

export interface SFXSampleRegion {
  id: string;
  assetId: string;
  name: string;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  gain: number;
  pan: number;
  fadeIn: number;
  fadeOut: number;
  reverse: boolean;
}

export interface SFXWaveformPeak { min: number; max: number; }

const clamp = (value:number,min:number,max:number):number => Math.min(max,Math.max(min,value));

export const assetDuration = (asset:SFXSampleAsset):number =>
  asset.lengthSamples / Math.max(1,asset.sampleRate);

export const sanitizeSampleAsset = (asset:SFXSampleAsset):SFXSampleAsset => ({
  ...asset,
  sampleRate: clamp(Math.round(asset.sampleRate),8000,384000),
  channels: clamp(Math.round(asset.channels),1,32),
  lengthSamples: Math.max(1,Math.round(asset.lengthSamples)),
});

export const normalizeSampleRegion = (region:SFXSampleRegion,asset:SFXSampleAsset):SFXSampleRegion => {
  const duration=assetDuration(asset);
  const sourceStart=clamp(region.sourceStart,0,Math.max(0,duration-.001));
  const sourceEnd=clamp(region.sourceEnd,sourceStart+.001,duration);
  const regionDuration=sourceEnd-sourceStart;
  return {...region,sourceStart,sourceEnd,timelineStart:Math.max(0,region.timelineStart),gain:clamp(region.gain,0,4),pan:clamp(region.pan,-1,1),fadeIn:clamp(region.fadeIn,0,regionDuration),fadeOut:clamp(region.fadeOut,0,regionDuration),reverse:Boolean(region.reverse)};
};

export const trimSampleRegion = (region:SFXSampleRegion,asset:SFXSampleAsset,start:number,end:number):SFXSampleRegion =>
  normalizeSampleRegion({...region,sourceStart:start,sourceEnd:end},asset);

export const moveSampleRegion = (region:SFXSampleRegion,timelineStart:number):SFXSampleRegion =>
  ({...region,timelineStart:Math.max(0,timelineStart)});

export const splitSampleRegion = (region:SFXSampleRegion,asset:SFXSampleAsset,offset:number,leftId:string,rightId:string):[SFXSampleRegion,SFXSampleRegion]|null => {
  const normalized=normalizeSampleRegion(region,asset);
  const duration=normalized.sourceEnd-normalized.sourceStart;
  if(offset<=.001||offset>=duration-.001)return null;
  const splitSource=normalized.reverse?normalized.sourceEnd-offset:normalized.sourceStart+offset;
  const boundary=clamp(splitSource,normalized.sourceStart+.001,normalized.sourceEnd-.001);
  const left=normalizeSampleRegion({...normalized,id:leftId,name:`${normalized.name} A`,sourceEnd:boundary,fadeOut:0},asset);
  const right=normalizeSampleRegion({...normalized,id:rightId,name:`${normalized.name} B`,sourceStart:boundary,timelineStart:normalized.timelineStart+offset,fadeIn:0},asset);
  return [left,right];
};

export const regionGainAt = (region:SFXSampleRegion,localTime:number):number => {
  const duration=Math.max(.001,region.sourceEnd-region.sourceStart);
  const t=clamp(localTime,0,duration);
  const fadeIn=region.fadeIn>0?clamp(t/region.fadeIn,0,1):1;
  const fadeOut=region.fadeOut>0?clamp((duration-t)/region.fadeOut,0,1):1;
  return region.gain*Math.min(fadeIn,fadeOut);
};

export const buildWaveformPeaks = (samples:Float32Array,buckets:number):SFXWaveformPeak[] => {
  const count=clamp(Math.round(buckets),1,Math.max(1,samples.length));
  const peaks:SFXWaveformPeak[]=[];
  for(let bucket=0;bucket<count;bucket++){
    const start=Math.floor(bucket*samples.length/count);
    const end=Math.max(start+1,Math.floor((bucket+1)*samples.length/count));
    let min=1,max=-1;
    for(let i=start;i<Math.min(end,samples.length);i++){const value=clamp(samples[i],-1,1);min=Math.min(min,value);max=Math.max(max,value);}
    peaks.push({min:min===1&&max===-1?0:min,max:min===1&&max===-1?0:max});
  }
  return peaks;
};
