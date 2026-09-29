export type DocumentSemanticSource = 'NATIVE_TEXT' | 'OCR_TEXT' | 'LOCAL_HEURISTIC' | 'LOCAL_MODEL' | 'EXTERNAL_MODEL';
export type DocumentEntityKind = 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'DATE' | 'MONEY' | 'EMAIL' | 'PHONE' | 'IDENTIFIER' | 'OTHER';
export type DocumentType =
  | 'INVOICE' | 'RECEIPT' | 'CONTRACT' | 'REPORT' | 'PRESENTATION' | 'SPREADSHEET'
  | 'LETTER' | 'FORM' | 'POLICY' | 'MANUAL' | 'MEETING_NOTES' | 'UNKNOWN';

export interface SemanticEvidence {
  source: DocumentSemanticSource;
  evidenceRefs: string[];
  confidence: number;
  modelId?: string;
  externalProcessing: boolean;
}
export interface DocumentEntity {
  id: string;
  kind: DocumentEntityKind;
  value: string;
  evidence: SemanticEvidence;
}
export interface DocumentSemanticAnalysis {
  documentType: { value: DocumentType; evidence: SemanticEvidence };
  topics: Array<{ value: string; evidence: SemanticEvidence }>;
  entities: DocumentEntity[];
  summary?: { value: string; evidence: SemanticEvidence };
  analyzerVersion: 'mio-document-semantics-v1';
}

const validConfidence=(n:number)=>Number.isFinite(n)&&n>=0&&n<=1;
export function validateSemanticEvidence(e:SemanticEvidence):void{
  if(!validConfidence(e.confidence)) throw new Error('Semantic confidence must be between 0 and 1');
  if(e.evidenceRefs.length===0||e.evidenceRefs.some(x=>!x.trim())) throw new Error('Semantic output requires evidence references');
  if(e.externalProcessing !== (e.source==='EXTERNAL_MODEL')) throw new Error('Semantic external-processing flag conflicts with source');
  if((e.source==='LOCAL_MODEL'||e.source==='EXTERNAL_MODEL')&&!e.modelId?.trim()) throw new Error('Model-derived semantics require modelId provenance');
}
export function validateDocumentSemanticAnalysis(a:DocumentSemanticAnalysis):DocumentSemanticAnalysis{
  validateSemanticEvidence(a.documentType.evidence);
  const ids=new Set<string>();
  for(const topic of a.topics){if(!topic.value.trim())throw new Error('Semantic topic cannot be empty');validateSemanticEvidence(topic.evidence);}
  for(const entity of a.entities){if(!entity.id.trim()||ids.has(entity.id))throw new Error('Semantic entity IDs must be unique');ids.add(entity.id);if(!entity.value.trim())throw new Error('Semantic entity value cannot be empty');validateSemanticEvidence(entity.evidence);}
  if(a.summary){if(!a.summary.value.trim())throw new Error('Semantic summary cannot be empty');validateSemanticEvidence(a.summary.evidence);}
  return a;
}
