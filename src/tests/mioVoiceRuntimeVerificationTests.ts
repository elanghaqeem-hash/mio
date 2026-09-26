import { evaluateMioVoiceRuntimeProbe } from '../services/voice/MioVoiceRuntimeVerification';
export async function runMioVoiceRuntimeVerificationTests():Promise<{passed:number;total:number}>{
 const ok=evaluateMioVoiceRuntimeProbe({status:200,engine:'v4.7',ready:true,sessionRequired:true,sessionVerificationConfigured:true,rateLimitRequired:true,rateLimitBindingConfigured:true});
 const bad=evaluateMioVoiceRuntimeProbe({status:503,engine:'v4.5',ready:false,sessionRequired:true,sessionVerificationConfigured:false,rateLimitRequired:true,rateLimitBindingConfigured:false});
 const checks=[ok.verified,!bad.verified,bad.blockers.includes('endpoint-status'),bad.blockers.includes('engine-version'),bad.blockers.includes('session-verification'),bad.blockers.includes('distributed-rate-limit-binding')];
 if(checks.some(v=>!v)) throw new Error('Mio Voice runtime verification regression');
 return {passed:checks.length,total:checks.length};
}
