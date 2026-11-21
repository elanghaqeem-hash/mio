import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { WindowsJournalIncidentRegistry } from '../../src/observability/WindowsJournalIncidentRegistry';
import { computeRecoveryReviewMac, type RecoveryReviewClaim } from '../../src/observability/WindowsJournalRecoveryReviewAuth';
const registry=new WindowsJournalIncidentRegistry();
const key=randomBytes(32),bytes=Buffer.alloc(0);
const identity={projectId:'projectA',taskId:'taskA',requestId:'requestA'};
const now=1000;
function issue(incidentId:string) {
 const challenge=registry.register(incidentId,identity,now);
 const body:Omit<RecoveryReviewClaim,'mac'>={...identity,...challenge,version:1,scope:'MIO_RECOVERY_REVIEW_ONLY',journalSha256:createHash('sha256').update(bytes).digest('hex'),issuedAt:now};
 return {...body,mac:computeRecoveryReviewMac(key,body)};
}
function check(result:ReturnType<typeof registry.review>,authenticated:boolean){
 assert.equal(result.authenticated,authenticated);
 assert.equal(result.automaticReplayPermitted,false);
 assert.equal(result.lockReleasePermitted,false);
 assert.equal(result.runtimeActivationPermitted,false);
}
const a=issue('incidentA'),b=issue('incidentB'),c=issue('incidentC');
assert.notEqual(a.nonce,b.nonce);
assert.throws(()=>registry.register('incidentA',identity,now),/MIO_INCIDENT_DENIED/);
check(registry.review('incidentA',key,{...a,mac:'0'.repeat(64)},bytes,now),false);
check(registry.review('incidentA',key,a,bytes,now),true);
check(registry.review('incidentA',key,a,bytes,now),false);
check(registry.review('incidentB',key,a,bytes,now),false);
check(registry.review('incidentB',key,b,bytes,b.expiresAt),false);
check(registry.review('unknown',key,c,bytes,now),false);
assert.equal(registry.inspect().consumed,1);
registry.stop();
check(registry.review('incidentC',key,c,bytes,now),false);
assert.throws(()=>registry.register('incidentD',identity,now),/MIO_INCIDENT_DENIED/);
assert.equal(registry.inspect().stopped,true);
const restarted=new WindowsJournalIncidentRegistry();
check(restarted.review('incidentA',key,a,bytes,now),false);
const fresh=restarted.register('incidentA',identity,now);
assert.notEqual(fresh.nonce,a.nonce);
check(restarted.review('incidentA',key,a,bytes,now),false);
console.log(JSON.stringify({probe:'PRV-11.04j',registry:'pass',productionReady:false,persistent:false}));
