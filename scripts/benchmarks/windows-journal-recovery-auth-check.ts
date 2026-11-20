import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { computeRecoveryReviewMac, verifyRecoveryReview, type RecoveryReviewClaim } from '../../src/observability/WindowsJournalRecoveryReviewAuth';
const key=randomBytes(32), bytes=Buffer.alloc(0);
const expected={projectId:'projectA',taskId:'taskA',requestId:'requestA',incidentId:'incidentA',nonce:randomBytes(32).toString('hex')};
const body:Omit<RecoveryReviewClaim,'mac'>={...expected,version:1,scope:'MIO_RECOVERY_REVIEW_ONLY',journalSha256:createHash('sha256').update(bytes).digest('hex'),issuedAt:1000,expiresAt:2000};
const claim={...body,mac:computeRecoveryReviewMac(key,body)};
function check(result:ReturnType<typeof verifyRecoveryReview>,authenticated:boolean) {
 assert.equal(result.authenticated,authenticated);
 assert.equal(result.automaticReplayPermitted,false);
 assert.equal(result.lockReleasePermitted,false);
 assert.equal(result.runtimeActivationPermitted,false);
}
check(verifyRecoveryReview(key,claim,bytes,expected,1500),true);
check(verifyRecoveryReview(randomBytes(32),claim,bytes,expected,1500),false);
check(verifyRecoveryReview(key,{...claim,mac:'0'.repeat(64)},bytes,expected,1500),false);
check(verifyRecoveryReview(key,claim,Buffer.from('changed'),expected,1500),false);
check(verifyRecoveryReview(key,claim,bytes,{...expected,nonce:randomBytes(32).toString('hex')},1500),false);
check(verifyRecoveryReview(key,claim,bytes,{...expected,requestId:'other'},1500),false);
check(verifyRecoveryReview(key,claim,bytes,expected,2000),false);
check(verifyRecoveryReview(key,claim,bytes,expected,999),false);
check(verifyRecoveryReview(key,{...claim,scope:'MIO_RECOVERY_EXECUTE'},bytes,expected,1500),false);
check(verifyRecoveryReview(key,{...claim,extra:true},bytes,expected,1500),false);
check(verifyRecoveryReview(Buffer.alloc(8),claim,bytes,expected,1500),false);
console.log(JSON.stringify({probe:'PRV-11.04i',positiveCases:1,negativeCases:10,productionReady:false}));
