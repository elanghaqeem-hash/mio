export interface MioVoiceV1ProductionEvidence {
  rc1Candidate: boolean;
  productionEndpointVerified: boolean;
  providerAudioVerified: boolean;
  sessionBoundaryVerified: boolean;
  distributedRateLimitVerified: boolean;
  iosSafariVerified: boolean;
  desktopSafariVerified: boolean;
  chromiumVerified: boolean;
}

export interface MioVoiceV1ProductionAcceptance {
  status: 'blocked' | 'accepted';
  blockers: string[];
}

export function evaluateMioVoiceV1ProductionAcceptance(e:MioVoiceV1ProductionEvidence):MioVoiceV1ProductionAcceptance {
 const checks:[keyof MioVoiceV1ProductionEvidence,string][]=[
  ['rc1Candidate','rc1-candidate'],
  ['productionEndpointVerified','production-endpoint'],
  ['providerAudioVerified','provider-audio'],
  ['sessionBoundaryVerified','session-boundary'],
  ['distributedRateLimitVerified','distributed-rate-limit'],
  ['iosSafariVerified','ios-safari'],
  ['desktopSafariVerified','desktop-safari'],
  ['chromiumVerified','chromium'],
 ];
 const blockers=checks.filter(([key])=>!e[key]).map(([,name])=>name);
 return {status:blockers.length===0?'accepted':'blocked',blockers};
}
