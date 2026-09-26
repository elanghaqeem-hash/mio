import { mioVoiceRateLimitKey, normalizeMioVoiceRateLimitDecision } from '../services/voice/MioVoiceRateLimitContract';
export async function runMioVoiceRateLimitContractTests():Promise<{passed:number;total:number}>{
 const a=normalizeMioVoiceRateLimitDecision({allowed:false,retryAfterSeconds:0});
 const b=normalizeMioVoiceRateLimitDecision({allowed:false,retryAfterSeconds:99999});
 const c=normalizeMioVoiceRateLimitDecision({allowed:true,retryAfterSeconds:99});
 const checks=[mioVoiceRateLimitKey(' user-1 ')==='subject:user-1',mioVoiceRateLimitKey(null)==='anonymous',a.retryAfterSeconds===1,b.retryAfterSeconds===3600,c.allowed===true,c.retryAfterSeconds===undefined];
 if(checks.some(v=>!v)) throw new Error('Mio distributed rate-limit contract regression');
 return {passed:checks.length,total:checks.length};
}
