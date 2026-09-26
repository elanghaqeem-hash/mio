import { evaluateMioVoiceRc1Gate } from '../services/voice/MioVoiceRc1ReleaseGate';
export async function runMioVoiceRc1ReleaseGateTests():Promise<{passed:number;total:number}>{
 const base={ciPassed:true,deviceValidationPassed:true,sessionProtectionReady:true,providerConfigured:true,distributedRateLimitRequired:true,distributedRateLimitBindingReady:true};
 const ready=evaluateMioVoiceRc1Gate(base);
 const blocked=evaluateMioVoiceRc1Gate({...base,deviceValidationPassed:false,distributedRateLimitBindingReady:false});
 const optional=evaluateMioVoiceRc1Gate({...base,distributedRateLimitRequired:false,distributedRateLimitBindingReady:false});
 const checks=[ready.ready,!blocked.ready,blocked.blockers.includes('real-device-validation'),blocked.blockers.includes('distributed-rate-limit-binding'),optional.ready];
 if(checks.some(v=>!v)) throw new Error('Mio Voice RC1 release gate regression');
 return {passed:checks.length,total:checks.length};
}
