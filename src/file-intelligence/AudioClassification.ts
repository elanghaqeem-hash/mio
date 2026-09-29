export type AudioContentClass='SPEECH'|'MUSIC'|'SFX'|'MIXED'|'SILENCE'|'UNKNOWN';
export type AudioClassificationSource='LOCAL_HEURISTIC'|'LOCAL_MODEL'|'EXTERNAL_MODEL';
export interface AudioClassificationEvidence{startSeconds:number;endSeconds:number;source:AudioClassificationSource;confidence:number;modelId?:string;externalProcessing:boolean;}
export interface AudioClassification{class:AudioContentClass;evidence:AudioClassificationEvidence[];analyzerVersion:'mio-audio-classification-v1';}
export function validateAudioClassification(a:AudioClassification):AudioClassification{
 if(a.evidence.length===0)throw new Error('Audio classification requires evidence');
 for(const e of a.evidence){
  if(!Number.isFinite(e.startSeconds)||!Number.isFinite(e.endSeconds)||e.startSeconds<0||e.endSeconds<=e.startSeconds)throw new Error('Invalid audio evidence range');
  if(!Number.isFinite(e.confidence)||e.confidence<0||e.confidence>1)throw new Error('Audio classification confidence must be between 0 and 1');
  if(e.externalProcessing!==(e.source==='EXTERNAL_MODEL'))throw new Error('Audio classification processing provenance conflicts with source');
  if((e.source==='LOCAL_MODEL'||e.source==='EXTERNAL_MODEL')&&!e.modelId?.trim())throw new Error('Model-derived audio classification requires modelId');
 }
 return a;
}
