/** Diagnostic in-memory registry. Never grants execution or lock release. */
import { randomBytes } from 'node:crypto';
import { verifyRecoveryReview } from './WindowsJournalRecoveryReviewAuth';
type Identity={projectId:string;taskId:string;requestId:string};
type Entry=Identity&{nonce:string;expiresAt:number;consumed:boolean};
const ID=/^[A-Za-z0-9_.:-]{1,120}$/;
const valid=(s:unknown)=>typeof s==='string'&&ID.test(s);
export class WindowsJournalIncidentRegistry {
 private readonly incidents=new Map<string,Entry>();
 private stopped=false;
 register(incidentId:string,identity:Identity,now:number) {
  if(this.stopped||this.incidents.size>=1024||this.incidents.has(incidentId)||
   ![incidentId,identity.projectId,identity.taskId,identity.requestId].every(valid)||
   !Number.isSafeInteger(now)||now<0||now>Number.MAX_SAFE_INTEGER-300000)throw Error('MIO_INCIDENT_DENIED');
  const nonce=randomBytes(32).toString('hex'),expiresAt=now+300000;
  this.incidents.set(incidentId,{projectId:identity.projectId,taskId:identity.taskId,requestId:identity.requestId,nonce,expiresAt,consumed:false});
  return {incidentId,nonce,expiresAt};
 }
 review(incidentId:string,key:Buffer,claim:unknown,bytes:Buffer,now:number) {
  const denied={authenticated:false,automaticReplayPermitted:false,lockReleasePermitted:false,runtimeActivationPermitted:false} as const;
  const e=this.incidents.get(incidentId);
  if(this.stopped||!e||e.consumed||!Number.isSafeInteger(now)||now>=e.expiresAt||now<e.expiresAt-300000)return denied;
  const result=verifyRecoveryReview(key,claim,bytes,{...e,incidentId},now);
  if(result.authenticated)e.consumed=true;
  return result;
 }
 stop(){this.stopped=true;}
 inspect(){return {stopped:this.stopped,total:this.incidents.size,consumed:[...this.incidents.values()].filter(e=>e.consumed).length};}
}
