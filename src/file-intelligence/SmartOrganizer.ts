export type OrganizationActionKind='RECOMMEND_FOLDER'|'RECOMMEND_RENAME'|'RECOMMEND_MOVE'|'RECOMMEND_DUPLICATE_REVIEW'|'RECOMMEND_GROUP';
export type OrganizationEvidenceSource='RULE'|'METADATA'|'SEMANTIC'|'RELATIONSHIP_GRAPH'|'USER_INSTRUCTION';
export interface OrganizationRecommendation{id:string;assetIds:string[];kind:OrganizationActionKind;target?:string;confidence:number;source:OrganizationEvidenceSource;evidenceIds:string[];requiresApproval:true;execute:false;}
export interface OrganizationManifest{id:string;recommendations:OrganizationRecommendation[];generatedBy:'mio-smart-organizer-v1';mutationAllowed:false;}
export function validateOrganizationManifest(m:OrganizationManifest):OrganizationManifest{
 if(!m.id.trim()||m.mutationAllowed!==false)throw new Error('Organization manifest must be recommendation-only');
 const ids=new Set<string>();for(const r of m.recommendations){if(!r.id.trim()||ids.has(r.id)||!r.assetIds.length||r.assetIds.some(x=>!x.trim())||!Number.isFinite(r.confidence)||r.confidence<0||r.confidence>1||!r.evidenceIds.length||r.requiresApproval!==true||r.execute!==false)throw new Error('Invalid organization recommendation');ids.add(r.id);if((r.kind==='RECOMMEND_FOLDER'||r.kind==='RECOMMEND_RENAME'||r.kind==='RECOMMEND_MOVE'||r.kind==='RECOMMEND_GROUP')&&!r.target?.trim())throw new Error('Recommendation target is required');}
 return m;
}
