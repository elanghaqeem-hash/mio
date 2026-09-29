import type { MutationOperationKind } from './SafeMutation';
export type MutationJournalState='STARTED'|'OPERATION_COMPLETED'|'OPERATION_FAILED'|'COMPLETED'|'FAILED';
export interface MutationPathEvidence{relativePath:string;exists:boolean;kind?:'FILE'|'DIRECTORY';bytes?:number;modifiedAtMs?:number;sha256?:string;}
export interface MutationJournalEvent{sequence:number;transactionId:string;workspaceId:string;state:MutationJournalState;operationId?:string;operationKind?:MutationOperationKind;before?:MutationPathEvidence[];after?:MutationPathEvidence[];error?:string;recordedAt:string;}
export interface MutationJournal{transactionId:string;workspaceId:string;events:MutationJournalEvent[];}
export function validateMutationJournal(j:MutationJournal):MutationJournal{
 if(!j.transactionId.trim()||!j.workspaceId.trim())throw new Error('Journal identity required');let expected=1;
 for(const e of j.events){if(e.transactionId!==j.transactionId||e.workspaceId!==j.workspaceId||e.sequence!==expected++)throw new Error('Journal sequence/scope mismatch');if(!e.recordedAt.trim())throw new Error('Journal timestamp required');if((e.state==='OPERATION_COMPLETED'||e.state==='OPERATION_FAILED')&&!e.operationId)throw new Error('Operation journal event requires operation identity');}
 return j;
}
