export type DocumentRelationshipKind = 'EMBEDS' | 'REFERENCES' | 'DERIVED_FROM' | 'ATTACHMENT' | 'VERSION_OF' | 'RELATED';
export interface DocumentRelationship {
  id:string;
  fromAssetId:string;
  toAssetId:string;
  kind:DocumentRelationshipKind;
  evidenceRefs:string[];
  confidence:number;
  source:'PACKAGE'|'NATIVE_TEXT'|'OCR'|'HEURISTIC'|'MODEL';
  externalTarget:boolean;
}
export interface EmbeddedAssetReference {
  id:string;
  documentAssetId:string;
  packagePath:string;
  mediaKind:'IMAGE'|'AUDIO'|'VIDEO'|'OTHER';
  contentType?:string;
  relationshipId?:string;
}
const safePackagePath=(p:string)=>!!p&&!p.startsWith('/')&&!p.startsWith('\\')&&!/^[a-z]:/i.test(p)&&!p.replace(/\\/g,'/').split('/').includes('..');
export function validateDocumentRelationships(items:readonly DocumentRelationship[]):DocumentRelationship[]{
 const ids=new Set<string>();
 for(const item of items){
  if(!item.id.trim()||ids.has(item.id))throw new Error('Relationship IDs must be unique');ids.add(item.id);
  if(!item.fromAssetId.trim()||!item.toAssetId.trim())throw new Error('Relationship endpoints are required');
  if(!Number.isFinite(item.confidence)||item.confidence<0||item.confidence>1)throw new Error('Relationship confidence must be between 0 and 1');
  if(item.evidenceRefs.length===0||item.evidenceRefs.some(x=>!x.trim()))throw new Error('Relationship evidence is required');
 }
 return [...items].sort((a,b)=>a.id.localeCompare(b.id));
}
export function validateEmbeddedAssetReferences(items:readonly EmbeddedAssetReference[]):EmbeddedAssetReference[]{
 const ids=new Set<string>();
 for(const item of items){
  if(!item.id.trim()||ids.has(item.id))throw new Error('Embedded asset IDs must be unique');ids.add(item.id);
  if(!item.documentAssetId.trim()||!safePackagePath(item.packagePath))throw new Error('Unsafe embedded asset reference');
 }
 return [...items].sort((a,b)=>a.packagePath.localeCompare(b.packagePath)||a.id.localeCompare(b.id));
}
