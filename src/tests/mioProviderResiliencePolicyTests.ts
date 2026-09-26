import { shouldRetryMioVoiceProvider } from '../services/voice/MioProviderResiliencePolicy';
export async function runMioProviderResiliencePolicyTests():Promise<{passed:number;total:number}>{
 const checks=[shouldRetryMioVoiceProvider(429,1),shouldRetryMioVoiceProvider(503,1),!shouldRetryMioVoiceProvider(400,1),!shouldRetryMioVoiceProvider(401,1),!shouldRetryMioVoiceProvider(503,2)];
 if(checks.some(v=>!v)) throw new Error('Mio provider resilience policy regression');
 return {passed:checks.length,total:checks.length};
}
