import { validateMioVoiceDevice } from '../services/voice/MioVoiceDeviceValidation';
const summary=(o:any={})=>({samples:3,classes:{excellent:2,healthy:1,degraded:0,fallback:0},averageFirstChunkLatencyMs:100,averageFirstAudibleLatencyMs:800,totalRebuffers:0,peakBufferAheadMs:3000,...o});
export async function runMioVoiceDeviceValidationTests():Promise<{passed:number;total:number}>{
 const ready=validateMioVoiceDevice({deviceFamily:'chromium',summary:summary(),interruptionRecoveryPassed:true,longSessionPassed:true});
 const fallback=validateMioVoiceDevice({deviceFamily:'ios-safari',summary:summary({classes:{excellent:0,healthy:0,degraded:0,fallback:3}}),interruptionRecoveryPassed:true,longSessionPassed:true});
 const bad=validateMioVoiceDevice({deviceFamily:'chromium',summary:summary({samples:2,totalRebuffers:1,classes:{excellent:0,healthy:1,degraded:1,fallback:0}}),interruptionRecoveryPassed:false,longSessionPassed:false});
 const checks=[ready.ready,fallback.ready,!bad.ready,bad.blockers.includes('insufficient-completed-samples'),bad.blockers.includes('rebuffer-observed'),bad.blockers.includes('degraded-playback'),bad.blockers.includes('interruption-recovery'),bad.blockers.includes('long-session-stability')];
 if(checks.some(v=>!v)) throw new Error('Mio real-device validation contract regression');
 return {passed:checks.length,total:checks.length};
}
