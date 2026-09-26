export interface MioVoiceRuntimeProbeInput {
  status: number;
  engine?: string | null;
  ready?: boolean;
  rateLimitRequired?: boolean;
  rateLimitBindingConfigured?: boolean;
  sessionRequired?: boolean;
  sessionVerificationConfigured?: boolean;
}

export interface MioVoiceRuntimeProbeResult {
  verified: boolean;
  blockers: string[];
}

export function evaluateMioVoiceRuntimeProbe(p:MioVoiceRuntimeProbeInput):MioVoiceRuntimeProbeResult {
 const blockers:string[]=[];
 if(p.status!==200) blockers.push('endpoint-status');
 if(p.engine!=='v4.7') blockers.push('engine-version');
 if(p.ready!==true) blockers.push('gateway-readiness');
 if(p.sessionRequired===true && p.sessionVerificationConfigured!==true) blockers.push('session-verification');
 if(p.rateLimitRequired===true && p.rateLimitBindingConfigured!==true) blockers.push('distributed-rate-limit-binding');
 return {verified:blockers.length===0,blockers};
}
