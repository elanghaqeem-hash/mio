import type { MutationOperation } from './SafeMutation';
export interface InverseMutationPlan{originalOperationId:string;recoverable:boolean;reason?:string;operation?:MutationOperation;requiresFreshPreview:true;requiresApproval:true;}
export function planInverseMutation(o:MutationOperation):InverseMutationPlan{
 if(o.kind==='TRASH')return {originalOperationId:o.id,recoverable:false,reason:'OS trash restoration is not exposed as a verified Mio capability',requiresFreshPreview:true,requiresApproval:true};
 if(o.kind==='MKDIR')return {originalOperationId:o.id,recoverable:false,reason:'Directory removal is intentionally not exposed; preserve user-created or subsequently changed contents',requiresFreshPreview:true,requiresApproval:true};
 if(o.kind==='COPY')return {originalOperationId:o.id,recoverable:false,reason:'Undo copy would require destructive removal; T-13 does not expose permanent delete',requiresFreshPreview:true,requiresApproval:true};
 if(!o.source||!o.target)throw new Error('Rename/move inverse requires source and target');
 return {originalOperationId:o.id,recoverable:true,operation:{id:`undo:${o.id}`,kind:o.kind,source:o.target,target:o.source,collisionPolicy:'BLOCK'},requiresFreshPreview:true,requiresApproval:true};
}
export function planTransactionRecovery(operations:MutationOperation[],completedOperationIds:string[]):InverseMutationPlan[]{
 const completed=new Set(completedOperationIds);return [...operations].reverse().filter(o=>completed.has(o.id)).map(planInverseMutation);
}
