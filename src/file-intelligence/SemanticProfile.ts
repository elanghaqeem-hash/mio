export type SemanticModality='IMAGE'|'DOCUMENT'|'VIDEO'|'AUDIO'|'CREATIVE'|'MODEL_3D'|'FILE_METADATA';
export type SemanticSource='LOCAL_HEURISTIC'|'LOCAL_MODEL'|'EXTERNAL_MODEL'|'IMPORTED'|'USER_CONFIRMED';
export type SemanticClaimKind='TAG'|'TOPIC'|'ENTITY'|'PROJECT'|'CLIENT'|'DESCRIPTION';
export interface SemanticEvidenceRef{modality:SemanticModality;assetId:string;locator?:string;}
export interface SemanticClaim{id:string;kind:SemanticClaimKind;value:string;confidence:number;source:SemanticSource;modelId?:string;externalProcessing:boolean;evidence:SemanticEvidenceRef[];}
export interface SemanticAssetProfile{assetId:string;claims:SemanticClaim[];analyzerVersion:'mio-semantic-profile-v1';}
export function validateSemanticAssetProfile(p:SemanticAssetProfile):SemanticAssetProfile{
 if(!p.assetId.trim())throw new Error('Semantic profile requires asset identity');
 const ids=new Set<string>();
 for(const c of p.claims){
  if(!c.id.trim()||ids.has(c.id))throw new Error('Semantic claim IDs must be non-empty and unique');ids.add(c.id);
  if(!c.value.trim()||!Number.isFinite(c.confidence)||c.confidence<0||c.confidence>1||c.evidence.length===0)throw new Error('Semantic claim requires value, bounded confidence, and evidence');
  if(c.externalProcessing!==(c.source==='EXTERNAL_MODEL'))throw new Error('Semantic claim processing provenance conflicts with source');
  if((c.source==='LOCAL_MODEL'||c.source==='EXTERNAL_MODEL')&&!c.modelId?.trim())throw new Error('Model-derived semantic claim requires modelId');
  for(const e of c.evidence)if(!e.assetId.trim())throw new Error('Semantic evidence requires asset identity');
 }
 return p;
}
