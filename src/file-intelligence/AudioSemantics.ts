export type AudioInsightKind='TOPIC'|'MEETING'|'KEYWORD'|'SUMMARY'|'ACTION_ITEM';
export type AudioInsightSource='TRANSCRIPT_HEURISTIC'|'LOCAL_MODEL'|'EXTERNAL_MODEL';
export interface AudioInsightEvidence{segmentIndexes:number[];source:AudioInsightSource;confidence:number;modelId?:string;externalProcessing:boolean;}
export interface AudioInsight{kind:AudioInsightKind;text:string;evidence:AudioInsightEvidence;}
export interface AudioSemanticAnalysis{insights:AudioInsight[];analyzerVersion:'mio-audio-semantics-v1';}
export function validateAudioSemanticAnalysis(a:AudioSemanticAnalysis,segmentCount:number):AudioSemanticAnalysis{
 if(!Number.isSafeInteger(segmentCount)||segmentCount<1)throw new Error('Audio semantics require transcript segments');
 for(const i of a.insights){
  if(!i.text.trim()||i.evidence.segmentIndexes.length===0)throw new Error('Audio insight requires text and transcript evidence');
  if(i.evidence.segmentIndexes.some(x=>!Number.isSafeInteger(x)||x<0||x>=segmentCount))throw new Error('Audio insight references invalid transcript segment');
  if(!Number.isFinite(i.evidence.confidence)||i.evidence.confidence<0||i.evidence.confidence>1)throw new Error('Audio insight confidence must be between 0 and 1');
  if(i.evidence.externalProcessing!==(i.evidence.source==='EXTERNAL_MODEL'))throw new Error('Audio insight processing provenance conflicts with source');
  if((i.evidence.source==='LOCAL_MODEL'||i.evidence.source==='EXTERNAL_MODEL')&&!i.evidence.modelId?.trim())throw new Error('Model-derived audio insight requires modelId');
 }
 return a;
}
