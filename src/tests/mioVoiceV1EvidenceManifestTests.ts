import { buildMioVoiceV1Evidence } from '../services/voice/MioVoiceV1EvidenceManifest';
export async function runMioVoiceV1EvidenceManifestTests():Promise<{passed:number;total:number}>{
 const rec=(key:any,source:any='operator',reference='ref')=>({key,verified:true,source,reference,verifiedAt:'2026-09-26T00:00:00Z'});
 const keys=['rc1Candidate','productionEndpointVerified','providerAudioVerified','sessionBoundaryVerified','distributedRateLimitVerified','iosSafariVerified','desktopSafariVerified','chromiumVerified'] as const;
 const accepted=buildMioVoiceV1Evidence(keys.map(k=>rec(k)));
 const untraceable=buildMioVoiceV1Evidence(keys.map(k=>rec(k,'operator',k==='iosSafariVerified'?'':'ref')));
 const checks=[accepted.acceptance.status==='accepted',untraceable.acceptance.status==='blocked',untraceable.acceptance.blockers.includes('ios-safari')];
 if(checks.some(v=>!v)) throw new Error('Mio Voice V1 evidence manifest regression');
 return {passed:checks.length,total:checks.length};
}
