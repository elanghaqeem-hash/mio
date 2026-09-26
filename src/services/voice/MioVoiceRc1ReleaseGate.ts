export interface MioVoiceRc1GateInput {
  ciPassed: boolean;
  deviceValidationPassed: boolean;
  sessionProtectionReady: boolean;
  providerConfigured: boolean;
  distributedRateLimitRequired: boolean;
  distributedRateLimitBindingReady: boolean;
}

export interface MioVoiceRc1GateResult {
  ready: boolean;
  blockers: string[];
}

export function evaluateMioVoiceRc1Gate(input:MioVoiceRc1GateInput):MioVoiceRc1GateResult {
 const blockers:string[]=[];
 if(!input.ciPassed) blockers.push('ci');
 if(!input.deviceValidationPassed) blockers.push('real-device-validation');
 if(!input.sessionProtectionReady) blockers.push('session-protection');
 if(!input.providerConfigured) blockers.push('production-provider');
 if(input.distributedRateLimitRequired && !input.distributedRateLimitBindingReady) blockers.push('distributed-rate-limit-binding');
 return {ready:blockers.length===0,blockers};
}
