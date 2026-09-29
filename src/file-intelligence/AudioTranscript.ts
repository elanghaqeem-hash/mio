export type TranscriptSource='LOCAL_STT'|'EXTERNAL_STT'|'IMPORTED';
export interface TranscriptWord{startSeconds:number;endSeconds:number;text:string;confidence?:number;}
export interface TranscriptSegment{startSeconds:number;endSeconds:number;text:string;speakerId?:string;words?:TranscriptWord[];confidence?:number;}
export interface AudioTranscript{
 language?:string;segments:TranscriptSegment[];source:TranscriptSource;engineId:string;externalProcessing:boolean;
 diarization:{performed:boolean;source?:'LOCAL_DIARIZATION'|'EXTERNAL_DIARIZATION';engineId?:string};
 analyzerVersion:'mio-audio-transcript-v1';
}
const confidence=(n:number|undefined)=>n===undefined||(Number.isFinite(n)&&n>=0&&n<=1);
const range=(a:number,b:number)=>Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>a;
export function validateAudioTranscript(t:AudioTranscript):AudioTranscript{
 if(!t.engineId.trim())throw new Error('Transcript engine provenance is required');
 if(t.externalProcessing!==(t.source==='EXTERNAL_STT'))throw new Error('Transcript external-processing flag conflicts with source');
 if(t.segments.length===0)throw new Error('Transcript requires at least one grounded segment');
 let previousEnd=0;
 for(const s of t.segments){
  if(!range(s.startSeconds,s.endSeconds)||!s.text.trim()||!confidence(s.confidence))throw new Error('Invalid transcript segment');
  if(s.startSeconds<previousEnd)throw new Error('Transcript segments must be ordered and non-overlapping');previousEnd=s.endSeconds;
  for(const w of s.words??[]){if(!range(w.startSeconds,w.endSeconds)||w.startSeconds<s.startSeconds||w.endSeconds>s.endSeconds||!w.text.trim()||!confidence(w.confidence))throw new Error('Invalid transcript word evidence');}
  if(s.speakerId&&!t.diarization.performed)throw new Error('Speaker identity requires diarization provenance');
 }
 if(t.diarization.performed){
  if(!t.diarization.source||!t.diarization.engineId?.trim())throw new Error('Diarization requires source and engine provenance');
  const external=t.diarization.source==='EXTERNAL_DIARIZATION';
  if(external&&!t.externalProcessing)throw new Error('External diarization must be disclosed as external processing');
 }
 return t;
}
