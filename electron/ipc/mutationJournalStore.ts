import * as fs from 'fs';import * as path from 'path';import * as crypto from 'crypto';
export type DesktopMutationJournalState='STARTED'|'OPERATION_COMPLETED'|'OPERATION_FAILED'|'COMPLETED'|'FAILED';
export interface DesktopMutationJournalEvent{schemaVersion:1;sequence:number;transactionId:string;workspaceId:string;state:DesktopMutationJournalState;operationId?:string;operationKind?:string;source?:string;target?:string;error?:string;recordedAt:string;previousHash:string;eventHash:string;}
export class DesktopMutationJournalStore{
 private sequence=0;private previousHash='GENESIS';
 constructor(private readonly filePath:string){this.replayTail();}
 private replayTail(){if(!fs.existsSync(this.filePath))return;const lines=fs.readFileSync(this.filePath,'utf8').split(/\r?\n/).filter(Boolean);let previous='GENESIS',sequence=0;for(const line of lines){const event=JSON.parse(line) as DesktopMutationJournalEvent;const {eventHash,...base}=event;const expected=crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');if(expected!==eventHash||event.previousHash!==previous||event.sequence!==sequence+1)throw new Error('Mutation audit integrity verification failed during journal replay');previous=eventHash;sequence=event.sequence;}this.sequence=sequence;this.previousHash=previous;}
 public static atUserData(userData:string){return new DesktopMutationJournalStore(path.join(userData,'mutation-audit-v1.jsonl'));}
 public list(workspaceId:string,limit=100):DesktopMutationJournalEvent[]{if(!fs.existsSync(this.filePath))return [];const lines=fs.readFileSync(this.filePath,'utf8').split(/\r?\n/).filter(Boolean);let previous='GENESIS';const valid:DesktopMutationJournalEvent[]=[];for(const line of lines){const event=JSON.parse(line) as DesktopMutationJournalEvent;const {eventHash,...base}=event;const expected=crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');if(expected!==eventHash||event.previousHash!==previous||event.sequence!==valid.length+1)throw new Error('Mutation audit integrity verification failed');previous=eventHash;if(event.workspaceId===workspaceId)valid.push(event);}return valid.slice(-Math.min(500,Math.max(1,limit)));}
 public append(input:Omit<DesktopMutationJournalEvent,'schemaVersion'|'sequence'|'recordedAt'|'previousHash'|'eventHash'>):DesktopMutationJournalEvent{
  const base={schemaVersion:1 as const,sequence:++this.sequence,...input,recordedAt:new Date().toISOString(),previousHash:this.previousHash};
  const eventHash=crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');const event={...base,eventHash};fs.appendFileSync(this.filePath,JSON.stringify(event)+'\n',{encoding:'utf8',mode:0o600});this.previousHash=eventHash;return event;
 }
}
