/** PRV-11.04i — authenticate a bounded recovery review, never authorize mutation.
 * Trusted main-process caller must independently supply key, nonce and fresh evidence.
 * No IPC, token storage, lock release, or runtime activation.
 */
import * as crypto from 'node:crypto';
import { inspectRecoveryEvidence } from './WindowsJournalRecoveryEvidence';
type Identity={projectId:string;taskId:string;requestId:string};
export interface RecoveryReviewClaim extends Identity {
  version:1; scope:'MIO_RECOVERY_REVIEW_ONLY'; incidentId:string; nonce:string;
  journalSha256:string; issuedAt:number; expiresAt:number; mac:string;
}
const ID=/^[A-Za-z0-9_.:-]{1,120}$/;
const HEX=/^[a-f0-9]{64}$/;
const fields=['version','scope','incidentId','nonce','journalSha256','issuedAt','expiresAt','projectId','taskId','requestId','mac'];
const validId=(x:unknown):x is string=>typeof x==='string'&&ID.test(x);
const hex=(x:unknown):x is string=>typeof x==='string'&&HEX.test(x);
const validKey=(key:Buffer)=>Buffer.isBuffer(key)&&key.length>=32;
function valid(c:Omit<RecoveryReviewClaim,'mac'>):boolean {
 return c.version===1&&c.scope==='MIO_RECOVERY_REVIEW_ONLY'&&
 [c.incidentId,c.projectId,c.taskId,c.requestId].every(validId)&&hex(c.nonce)&&hex(c.journalSha256)&&
 Number.isSafeInteger(c.issuedAt)&&c.issuedAt>=0&&Number.isSafeInteger(c.expiresAt)&&
 c.expiresAt>c.issuedAt&&c.expiresAt-c.issuedAt<=300000;
}
export function computeRecoveryReviewMac(key:Buffer,c:Omit<RecoveryReviewClaim,'mac'>):string {
 if(!validKey(key)||!valid(c))throw Error('MIO_REVIEW_CLAIM_INVALID');
 return crypto.createHmac('sha256',key).update(JSON.stringify(['MIO-RECOVERY-REVIEW-HMAC-V1',c.scope,c.incidentId,c.nonce,c.projectId,c.taskId,c.requestId,c.journalSha256,c.issuedAt,c.expiresAt])).digest('hex');
}
export function verifyRecoveryReview(key:Buffer,claim:unknown,bytes:Buffer,expected:Identity&{incidentId:string;nonce:string},now:number) {
 const denied={automaticReplayPermitted:false,lockReleasePermitted:false,runtimeActivationPermitted:false} as const;
 const bad=()=>({...denied,authenticated:false,reason:'REVIEW_DENIED' as const});
 try {
  if(!validKey(key)||!claim||typeof claim!=='object'||Array.isArray(claim)||Object.getPrototypeOf(claim)!==Object.prototype)return bad();
  const c=claim as RecoveryReviewClaim;
  if(Object.keys(c).length!==fields.length||!fields.every(f=>Object.hasOwn(c,f))||!valid(c)||!hex(c.mac))return bad();
  if(!Number.isSafeInteger(now)||now<c.issuedAt||now>=c.expiresAt||
   c.incidentId!==expected.incidentId||c.nonce!==expected.nonce||c.projectId!==expected.projectId||c.taskId!==expected.taskId||c.requestId!==expected.requestId)return bad();
  const evidence=inspectRecoveryEvidence(bytes,expected);
  if(evidence.journalSha256!==c.journalSha256)return bad();
  const mac=computeRecoveryReviewMac(key,c);
  if(!crypto.timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(c.mac,'hex')))return bad();
  return {...denied,authenticated:true,reason:'AUTHENTICATED_REVIEW_ONLY' as const};
 } catch {return bad();}
}
