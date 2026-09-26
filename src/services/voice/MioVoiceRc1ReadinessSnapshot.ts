export interface MioVoiceRc1ReadinessSnapshot {
  codeComplete: boolean;
  ciVerified: boolean;
  deploymentVerified: boolean;
  physicalDevicesVerified: boolean;
  productionProviderVerified: boolean;
  distributedRateLimitVerified: boolean;
}

export function mioVoiceRc1ReadinessStatus(s:MioVoiceRc1ReadinessSnapshot):'engineering-complete'|'runtime-verification-required'|'production-candidate' {
 if(!s.codeComplete || !s.ciVerified) return 'engineering-complete';
 if(!s.deploymentVerified || !s.physicalDevicesVerified || !s.productionProviderVerified || !s.distributedRateLimitVerified) return 'runtime-verification-required';
 return 'production-candidate';
}
