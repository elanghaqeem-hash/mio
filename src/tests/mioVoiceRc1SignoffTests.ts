import { buildMioVoiceRc1Signoff } from '../services/voice/MioVoiceRc1Signoff';
const ok=(deviceFamily:any)=>({deviceFamily,completedSamples:3,interruptionRecoveryPassed:true,longSessionPassed:true,rebufferCount:0,degradedSamples:0});
const runtime={ciPassed:true,sessionProtectionReady:true,providerConfigured:true,distributedRateLimitRequired:true,distributedRateLimitBindingReady:true};
export async function runMioVoiceRc1SignoffTests():Promise<{passed:number;total:number}>{
 const candidate=buildMioVoiceRc1Signoff({generatedAt:'x',devices:[ok('ios-safari'),ok('desktop-safari'),ok('chromium')],runtime});
 const blocked=buildMioVoiceRc1Signoff({generatedAt:'x',devices:[ok('ios-safari'),ok('chromium')],runtime:{...runtime,providerConfigured:false}});
 const checks=[candidate.release==='candidate',candidate.blockers.length===0,blocked.release==='blocked',blocked.blockers.includes('missing-device:desktop-safari'),blocked.blockers.includes('production-provider')];
 if(checks.some(v=>!v)) throw new Error('Mio Voice RC1 signoff regression');
 return {passed:checks.length,total:checks.length};
}
