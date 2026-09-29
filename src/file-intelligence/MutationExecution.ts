import type { MutationApproval } from './MutationApproval';
import { assertApprovalMatchesPreview } from './MutationApproval';
import type { MutationPreview } from './MutationPreview';
import type { MutationTransaction } from './SafeMutation';
export interface MutationExecutionReceipt{transactionId:string;workspaceId:string;state:'COMPLETED'|'FAILED';completedOperationIds:string[];failedOperationId?:string;error?:string;}
export interface MutationExecutor{mutate(workspaceId:string,operation:MutationTransaction['operations'][number]):Promise<void>;}
export async function executeApprovedMutation(t:MutationTransaction,p:MutationPreview,a:MutationApproval,nonce:string,executor:MutationExecutor):Promise<MutationExecutionReceipt>{
 if(t.id!==p.transactionId||t.workspaceId!==p.workspaceId||!p.readyForApproval)throw new Error('Transaction does not match an approval-ready preview');
 assertApprovalMatchesPreview(a,p,nonce);const completedOperationIds:string[]=[];
 for(const operation of t.operations){try{await executor.mutate(t.workspaceId,operation);completedOperationIds.push(operation.id);}catch(error){return {transactionId:t.id,workspaceId:t.workspaceId,state:'FAILED',completedOperationIds,failedOperationId:operation.id,error:error instanceof Error?error.message:String(error)};}}
 return {transactionId:t.id,workspaceId:t.workspaceId,state:'COMPLETED',completedOperationIds};
}
