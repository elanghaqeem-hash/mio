import { validateMutationJournal,type MutationJournal,type MutationJournalEvent } from './MutationJournal';
export interface MutationAuditRecord{journalId:string;event:MutationJournalEvent;}
export class MutationAuditLog{
 private readonly records:MutationAuditRecord[]=[];
 public append(journal:MutationJournal,event:MutationJournalEvent):void{validateMutationJournal({...journal,events:[...journal.events,event]});this.records.push({journalId:`${journal.workspaceId}:${journal.transactionId}`,event:{...event,before:event.before?.map(x=>({...x})),after:event.after?.map(x=>({...x}))}});}
 public list(workspaceId:string,transactionId?:string,limit=200):MutationAuditRecord[]{const bounded=Math.max(1,Math.min(1000,Math.trunc(limit)));return this.records.filter(r=>r.event.workspaceId===workspaceId&&(!transactionId||r.event.transactionId===transactionId)).slice(-bounded).map(r=>({journalId:r.journalId,event:{...r.event,before:r.event.before?.map(x=>({...x})),after:r.event.after?.map(x=>({...x}))}}));}
}
