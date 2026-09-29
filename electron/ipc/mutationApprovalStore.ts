import * as crypto from 'crypto';
import type { DesktopMutationTransaction } from './mutationApproval';
export interface IssuedMutationApproval{token:string;transactionId:string;workspaceId:string;expiresAt:number;}
interface Stored extends IssuedMutationApproval{fingerprint:string;}
export class MutationApprovalStore{
 private readonly records=new Map<string,Stored>();constructor(private readonly ttlMs=5*60*1000){}
 private fingerprint(t:DesktopMutationTransaction){return crypto.createHash('sha256').update(JSON.stringify(t)).digest('hex');}
 issue(t:DesktopMutationTransaction):IssuedMutationApproval{const token=crypto.randomBytes(32).toString('hex'),r={token,transactionId:t.id,workspaceId:t.workspaceId,expiresAt:Date.now()+this.ttlMs,fingerprint:this.fingerprint(t)};this.records.set(token,r);return {token:r.token,transactionId:r.transactionId,workspaceId:r.workspaceId,expiresAt:r.expiresAt};}
 consume(t:DesktopMutationTransaction,token:string):void{const r=this.records.get(token);this.records.delete(token);if(!r||r.expiresAt<Date.now()||r.transactionId!==t.id||r.workspaceId!==t.workspaceId||r.fingerprint!==this.fingerprint(t))throw new Error('Mutation approval is invalid, expired, replayed, or does not match transaction');}
 revokeWorkspace(id:string){for(const [k,v] of this.records)if(v.workspaceId===id)this.records.delete(k);}clear(){this.records.clear();}
}
