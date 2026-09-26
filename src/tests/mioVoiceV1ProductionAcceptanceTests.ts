import { evaluateMioVoiceV1ProductionAcceptance } from '../services/voice/MioVoiceV1ProductionAcceptance';
const all={rc1Candidate:true,productionEndpointVerified:true,providerAudioVerified:true,sessionBoundaryVerified:true,distributedRateLimitVerified:true,iosSafariVerified:true,desktopSafariVerified:true,chromiumVerified:true};
export async function runMioVoiceV1ProductionAcceptanceTests():Promise<{passed:number;total:number}>{
 const accepted=evaluateMioVoiceV1ProductionAcceptance(all);
 const blocked=evaluateMioVoiceV1ProductionAcceptance({...all,productionEndpointVerified:false,iosSafariVerified:false});
 const checks=[accepted.status==='accepted',accepted.blockers.length===0,blocked.status==='blocked',blocked.blockers.includes('production-endpoint'),blocked.blockers.includes('ios-safari')];
 if(checks.some(v=>!v)) throw new Error('Mio Voice V1 production acceptance regression');
 return {passed:checks.length,total:checks.length};
}
