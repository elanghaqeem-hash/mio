import { evaluateMioVoiceRc1Evidence } from '../services/voice/MioVoiceRc1EvidenceBundle';
const ok=(deviceFamily:any)=>({deviceFamily,completedSamples:3,interruptionRecoveryPassed:true,longSessionPassed:true,rebufferCount:0,degradedSamples:0});
export async function runMioVoiceRc1EvidenceBundleTests():Promise<{passed:number;total:number}>{
 const runtime={ciPassed:true,sessionProtectionReady:true,providerConfigured:true,distributedRateLimitRequired:true,distributedRateLimitBindingReady:true};
 const ready=evaluateMioVoiceRc1Evidence({generatedAt:'2026-09-26T00:00:00Z',devices:[ok('ios-safari'),ok('desktop-safari'),ok('chromium')],runtime});
 const blocked=evaluateMioVoiceRc1Evidence({generatedAt:'2026-09-26T00:00:00Z',devices:[ok('ios-safari'),ok('chromium')],runtime});
 const checks=[ready.ready,ready.device.ready,!blocked.ready,blocked.device.missing.includes('desktop-safari'),blocked.release.blockers.includes('real-device-validation')];
 if(checks.some(v=>!v)) throw new Error('Mio Voice RC1 evidence bundle regression');
 return {passed:checks.length,total:checks.length};
}
