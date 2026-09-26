import { sanitizeMioVoiceGatewayObservation } from '../services/voice/MioVoiceGatewayObservability';
export async function runMioVoiceGatewayObservabilityTests():Promise<{passed:number;total:number}>{
 const x=sanitizeMioVoiceGatewayObservation({outcome:'provider-error',attempts:9,durationMs:-2.4,upstreamStatus:503.9});
 const checks=[x.attempts===2,x.durationMs===0,x.upstreamStatus===503,!('text' in x),!('session' in x)];
 if(checks.some(v=>!v)) throw new Error('Mio gateway observability privacy regression');
 return {passed:checks.length,total:checks.length};
}
