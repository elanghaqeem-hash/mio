export type AudioContainer='WAV'|'MP3'|'M4A'|'AAC'|'OGG'|'FLAC'|'WEBM'|'UNKNOWN';
export interface AudioStreamMetadata{index:number;codec:string;durationSeconds?:number;bitrate?:number;sampleRate?:number;channels?:number;language?:string;}
export interface AudioProbeResult{
 container:AudioContainer;durationSeconds?:number;bitrate?:number;streams:AudioStreamMetadata[];
 source:'CONTAINER_HEADER'|'LOCAL_PROBE'|'EXTERNAL_PROBE';probeId:string;externalProcessing:boolean;
 analyzerVersion:'mio-audio-probe-v1';
}
const positive=(n:number|undefined)=>n===undefined||(Number.isFinite(n)&&n>0);
export function validateAudioProbe(r:AudioProbeResult):AudioProbeResult{
 if(!r.probeId.trim())throw new Error('Audio probe provenance is required');
 if(r.externalProcessing!==(r.source==='EXTERNAL_PROBE'))throw new Error('Audio probe external-processing flag conflicts with source');
 if(!positive(r.durationSeconds)||!positive(r.bitrate))throw new Error('Audio duration/bitrate must be positive');
 const indexes=new Set<number>();
 for(const s of r.streams){
  if(!Number.isSafeInteger(s.index)||s.index<0||indexes.has(s.index))throw new Error('Audio stream indexes must be unique non-negative integers');indexes.add(s.index);
  if(!s.codec.trim())throw new Error('Audio codec is required');
  if(!positive(s.durationSeconds)||!positive(s.bitrate)||!positive(s.sampleRate))throw new Error('Audio numeric metadata must be positive');
  if(s.channels!==undefined&&(!Number.isSafeInteger(s.channels)||s.channels<=0))throw new Error('Audio channels must be a positive integer');
 }
 return r;
}
export function primaryAudioStream(r:AudioProbeResult):AudioStreamMetadata|undefined{
 validateAudioProbe(r);return [...r.streams].sort((a,b)=>(b.channels??0)-(a.channels??0)||(b.sampleRate??0)-(a.sampleRate??0)||a.index-b.index)[0];
}
