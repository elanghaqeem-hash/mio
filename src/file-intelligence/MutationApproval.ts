import type { MutationPreview } from './MutationPreview';
export interface MutationApproval{transactionId:string;workspaceId:string;previewDigest:string;approvedAt:string;approvedBy:'USER';token:string;}
const tokenMaterial=(p:MutationPreview,nonce:string)=>`${p.transactionId}|${p.workspaceId}|${p.previewDigest}|${nonce}`;
export function createMutationApproval(p:MutationPreview,nonce:string,approvedAt=new Date().toISOString()):MutationApproval{
 if(!p.readyForApproval||!nonce.trim())throw new Error('Only a clean preview can be approved');const material=tokenMaterial(p,nonce);let h=2166136261;for(let i=0;i<material.length;i++){h^=material.charCodeAt(i);h=Math.imul(h,16777619);}return {transactionId:p.transactionId,workspaceId:p.workspaceId,previewDigest:p.previewDigest,approvedAt,approvedBy:'USER',token:`approval-v1:${(h>>>0).toString(16).padStart(8,'0')}`};
}
export function assertApprovalMatchesPreview(a:MutationApproval,p:MutationPreview,nonce:string):void{
 const expected=createMutationApproval(p,nonce,a.approvedAt);if(a.approvedBy!=='USER'||a.transactionId!==p.transactionId||a.workspaceId!==p.workspaceId||a.previewDigest!==p.previewDigest||a.token!==expected.token)throw new Error('Mutation approval does not match the exact preview');
}
