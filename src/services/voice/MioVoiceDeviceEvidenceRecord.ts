import type { MioVoiceDeviceFamily } from './MioVoiceDeviceValidation';

export interface MioVoiceDeviceEvidenceRecord {
  deviceFamily: MioVoiceDeviceFamily;
  completedSamples: number;
  interruptionRecoveryPassed: boolean;
  longSessionPassed: boolean;
  rebufferCount: number;
  degradedSamples: number;
  reference: string;
  verifiedAt: string;
}

export function validateMioVoiceDeviceEvidence(r:MioVoiceDeviceEvidenceRecord):string[] {
 const blockers:string[]=[];
 if(r.completedSamples<3) blockers.push('insufficient-completed-samples');
 if(!r.interruptionRecoveryPassed) blockers.push('interruption-recovery');
 if(!r.longSessionPassed) blockers.push('long-session-stability');
 if(r.rebufferCount>0) blockers.push('rebuffer-observed');
 if(r.degradedSamples>0) blockers.push('degraded-playback');
 if(!r.reference.trim()) blockers.push('missing-reference');
 if(!r.verifiedAt.trim()) blockers.push('missing-verification-time');
 return blockers;
}
