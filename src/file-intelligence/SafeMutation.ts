export type MutationOperationKind='MKDIR'|'RENAME'|'MOVE'|'COPY'|'TRASH';
export type MutationCollisionPolicy='BLOCK';
export interface MutationOperation{id:string;kind:MutationOperationKind;source?:string;target?:string;collisionPolicy:'BLOCK';}
export interface MutationTransaction{id:string;workspaceId:string;operations:MutationOperation[];state:'PROPOSED'|'PREVIEWED'|'APPROVED'|'EXECUTING'|'COMPLETED'|'FAILED';}
export function validateMutationTransaction(t:MutationTransaction):MutationTransaction{
 if(!t.id.trim()||!t.workspaceId.trim()||!t.operations.length)throw new Error('Mutation transaction requires identity, workspace, and operations');
 const ids=new Set<string>();for(const o of t.operations){if(!o.id.trim()||ids.has(o.id)||o.collisionPolicy!=='BLOCK')throw new Error('Invalid mutation operation');ids.add(o.id);
  if(o.kind==='MKDIR'){if(o.source||!o.target?.trim())throw new Error('MKDIR requires target only');}
  else if(o.kind==='TRASH'){if(!o.source?.trim()||o.target)throw new Error('TRASH requires source only');}
  else if(!o.source?.trim()||!o.target?.trim())throw new Error(`${o.kind} requires source and target`);
 }
 return t;
}
