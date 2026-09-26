import { evaluateMioVoiceAcceptanceMatrix } from '../services/voice/MioVoiceAcceptanceMatrix';
const ok=(deviceFamily:any)=>({deviceFamily,completedSamples:3,interruptionRecoveryPassed:true,longSessionPassed:true,rebufferCount:0,degradedSamples:0});
export async function runMioVoiceAcceptanceMatrixTests():Promise<{passed:number;total:number}>{
 const ready=evaluateMioVoiceAcceptanceMatrix([ok('ios-safari'),ok('desktop-safari'),ok('chromium')]);
 const missing=evaluateMioVoiceAcceptanceMatrix([ok('ios-safari'),ok('chromium')]);
 const failed=evaluateMioVoiceAcceptanceMatrix([ok('ios-safari'),{...ok('desktop-safari'),rebufferCount:1},ok('chromium')]);
 const checks=[ready.ready,!missing.ready,missing.missing.includes('desktop-safari'),!failed.ready,failed.failed.includes('desktop-safari')];
 if(checks.some(v=>!v)) throw new Error('Mio Voice acceptance matrix regression');
 return {passed:checks.length,total:checks.length};
}
