export type VideoContainer = 'MP4'|'MOV'|'WEBM'|'MATROSKA'|'AVI'|'UNKNOWN';
export type VideoStreamKind = 'VIDEO'|'AUDIO'|'SUBTITLE'|'DATA'|'UNKNOWN';
export interface VideoStreamMetadata {
  index:number; kind:VideoStreamKind; codec:string; durationSeconds?:number; bitrate?:number;
  width?:number; height?:number; frameRate?:number; sampleRate?:number; channels?:number; language?:string;
}
export interface VideoProbeResult {
  container:VideoContainer; durationSeconds?:number; bitrate?:number; streams:VideoStreamMetadata[];
  source:'CONTAINER_HEADER'|'LOCAL_PROBE'|'EXTERNAL_PROBE'; probeId:string; externalProcessing:boolean;
  analyzerVersion:'mio-video-probe-v1';
}
const positive=(n:number|undefined)=>n===undefined||(Number.isFinite(n)&&n>0);
export function validateVideoProbe(result:VideoProbeResult):VideoProbeResult{
 if(!result.probeId.trim())throw new Error('Video probe provenance is required');
 if(result.externalProcessing!==(result.source==='EXTERNAL_PROBE'))throw new Error('Video probe external-processing flag conflicts with source');
 if(!positive(result.durationSeconds)||!positive(result.bitrate))throw new Error('Video duration/bitrate must be positive');
 const indexes=new Set<number>();
 for(const s of result.streams){
  if(!Number.isSafeInteger(s.index)||s.index<0||indexes.has(s.index))throw new Error('Video stream indexes must be unique non-negative integers');indexes.add(s.index);
  if(!s.codec.trim())throw new Error('Video stream codec is required');
  if(!positive(s.durationSeconds)||!positive(s.bitrate)||!positive(s.frameRate)||!positive(s.sampleRate))throw new Error('Video stream numeric metadata must be positive');
  if(s.width!==undefined&&(!Number.isSafeInteger(s.width)||s.width<=0))throw new Error('Video width must be a positive integer');
  if(s.height!==undefined&&(!Number.isSafeInteger(s.height)||s.height<=0))throw new Error('Video height must be a positive integer');
  if(s.channels!==undefined&&(!Number.isSafeInteger(s.channels)||s.channels<=0))throw new Error('Audio channels must be a positive integer');
  if(s.kind==='VIDEO'&&(s.width===undefined||s.height===undefined))throw new Error('Video streams require dimensions');
 }
 return result;
}
export function primaryVideoStream(result:VideoProbeResult):VideoStreamMetadata|undefined{
 validateVideoProbe(result);
 return result.streams.filter(s=>s.kind==='VIDEO').sort((a,b)=>(b.width??0)*(b.height??0)-(a.width??0)*(a.height??0)||a.index-b.index)[0];
}
