import { validateMioVoiceDeviceEvidence } from '../services/voice/MioVoiceDeviceEvidenceRecord';
export async function runMioVoiceDeviceEvidenceRecordTests():Promise<{passed:number;total:number}>{
 const base={deviceFamily:'ios-safari' as const,completedSamples:3,interruptionRecoveryPassed:true,longSessionPassed:true,rebufferCount:0,degradedSamples:0,reference:'device-run-1',verifiedAt:'2026-09-26T00:00:00Z'};
 const ok=validateMioVoiceDeviceEvidence(base);
 const bad=validateMioVoiceDeviceEvidence({...base,completedSamples:2,rebufferCount:1,reference:''});
 const checks=[ok.length===0,bad.includes('insufficient-completed-samples'),bad.includes('rebuffer-observed'),bad.includes('missing-reference')];
 if(checks.some(v=>!v)) throw new Error('Mio Voice device evidence record regression');
 return {passed:checks.length,total:checks.length};
}
