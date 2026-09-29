export type VideoSemanticKind='SCENE'|'ACTIVITY'|'SCREEN_RECORDING'|'TITLE_CARD'|'DIALOGUE'|'UNKNOWN';
export type VideoSemanticSource='FRAME_HEURISTIC'|'LOCAL_MODEL'|'EXTERNAL_MODEL';
export interface VideoSemanticEvidence{sampleTimestamps:number[];source:VideoSemanticSource;confidence:number;modelId?:string;externalProcessing:boolean;}
export interface VideoSemanticSignal{kind:VideoSemanticKind;label:string;evidence:VideoSemanticEvidence;}
export interface VideoSemanticAnalysis{signals:VideoSemanticSignal[];summary?:{text:string;evidence:VideoSemanticEvidence};analyzerVersion:'mio-video-semantics-v1';}
function validateEvidence(e:VideoSemanticEvidence):void{
 if(e.sampleTimestamps.length===0||e.sampleTimestamps.some(t=>!Number.isFinite(t)||t<0))throw new Error('Video semantics require valid sampled-frame evidence');
 if(!Number.isFinite(e.confidence)||e.confidence<0||e.confidence>1)throw new Error('Video semantic confidence must be between 0 and 1');
 if(e.externalProcessing!==(e.source==='EXTERNAL_MODEL'))throw new Error('Video semantic processing provenance conflicts with source');
 if((e.source==='LOCAL_MODEL'||e.source==='EXTERNAL_MODEL')&&!e.modelId?.trim())throw new Error('Model-derived video semantics require modelId');
}
export function validateVideoSemantics(a:VideoSemanticAnalysis):VideoSemanticAnalysis{
 for(const s of a.signals){if(!s.label.trim())throw new Error('Video semantic labels cannot be empty');validateEvidence(s.evidence);}
 if(a.summary){if(!a.summary.text.trim())throw new Error('Video semantic summary cannot be empty');validateEvidence(a.summary.evidence);}
 return a;
}
