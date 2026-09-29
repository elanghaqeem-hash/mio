import * as fs from 'fs';import * as path from 'path';import * as crypto from 'crypto';
export type DesktopMutationJournalState='STARTED'|'OPERATION_COMPLETED'|'OPERATION_FAILED'|'COMPLETED'|'FAILED';
export interface DesktopMutationJournalEvent{schemaVersion:1;sequence:number;transactionId:string;workspaceId:string;state:DesktopMutationJournalState;operationId?:string;operationKind?:string;source?:string;target?:string;error?:string;recordedAt:string;previousHash:string;eventHash:string;}
export class DesktopMutationJournalStore{
 private sequence=0;private previousHash='GENESIS';
 constructor(private readonly filePath:string){}
 public static atUserData(userData:string){return new DesktopMutationJournalStore(path.join(userData,'mutation-audit-v1.jsonl'));}
 public append(input:Omit<DesktopMutationJournalEvent,'schemaVersion'|'sequence'|'recordedAt'|'previousHash'|'eventHash'>):DesktopMutationJournalEvent{
  const base={schemaVersion:1 as const,sequence:++this.sequence,...input,recordedAt:new Date().toISOString(),previousHash:this.previousHash};
  const eventHash=crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');const event={...base,eventHash};fs.appendFileSync(this.filePath,JSON.stringify(event)+'\n',{encoding:'utf8',mode:0o600});this.previousHash=eventHash;return event;
 }
}
