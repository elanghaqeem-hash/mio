import { evaluateMioVoiceBoundaryProbe } from '../services/voice/MioVoiceBoundaryVerification';
export async function runMioVoiceBoundaryVerificationTests():Promise<{passed:number;total:number}>{
 const ok=evaluateMioVoiceBoundaryProbe({unauthenticatedStatus:401,authenticatedStatus:200,authenticatedSessionHeader:'authenticated',rateLimitedStatus:429,retryAfter:'60'});
 const bad=evaluateMioVoiceBoundaryProbe({unauthenticatedStatus:200,authenticatedStatus:200,authenticatedSessionHeader:null,rateLimitedStatus:200,retryAfter:null});
 const checks=[ok.sessionVerified,ok.rateLimitVerified,ok.blockers.length===0,!bad.sessionVerified,!bad.rateLimitVerified,bad.blockers.includes('session-boundary'),bad.blockers.includes('distributed-rate-limit-enforcement')];
 if(checks.some(v=>!v)) throw new Error('Mio Voice boundary verification regression');
 return {passed:checks.length,total:checks.length};
}
