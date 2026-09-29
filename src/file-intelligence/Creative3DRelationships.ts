export type Creative3DRelationshipKind='TEXTURE'|'MATERIAL'|'EXTERNAL_ASSET'|'EMBEDDED_ASSET'|'DERIVED_PREVIEW';
export interface Creative3DRelationship{kind:Creative3DRelationshipKind;target:string;verified:boolean;evidence:'STRUCTURE_REFERENCE'|'MANIFEST_REFERENCE'|'IMPORTED_REFERENCE'|'DERIVED_OUTPUT';}
export interface Creative3DRelationshipGraph{sourceAssetId:string;relationships:Creative3DRelationship[];analyzerVersion:'mio-creative-3d-relationships-v1';}
export function validateCreative3DRelationshipGraph(g:Creative3DRelationshipGraph):Creative3DRelationshipGraph{
 if(!g.sourceAssetId.trim())throw new Error('Relationship graph requires source asset identity');
 const keys=new Set<string>();
 for(const r of g.relationships){
  if(!r.target.trim())throw new Error('Relationship target is required');
  if(r.target.includes('..')||r.target.startsWith('/')||/^[a-zA-Z]:[\\/]/.test(r.target))throw new Error('Unsafe relationship target path');
  const key=`${r.kind}:${r.target}`;if(keys.has(key))throw new Error('Duplicate creative/3D relationship');keys.add(key);
  if(r.verified&&r.evidence==='IMPORTED_REFERENCE')throw new Error('Imported references cannot be promoted to verified without structure/manifest evidence');
 }
 return g;
}
export function verifiedCreative3DRelationships(g:Creative3DRelationshipGraph):Creative3DRelationship[]{validateCreative3DRelationshipGraph(g);return g.relationships.filter(r=>r.verified);}
