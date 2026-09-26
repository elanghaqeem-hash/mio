import type { MioVoiceDeviceFamily } from './MioVoiceDeviceValidation';

export interface MioVoiceAcceptanceCase {
  deviceFamily: MioVoiceDeviceFamily;
  completedSamples: number;
  interruptionRecoveryPassed: boolean;
  longSessionPassed: boolean;
  rebufferCount: number;
  degradedSamples: number;
}

export interface MioVoiceAcceptanceMatrixResult {
  ready: boolean;
  missing: MioVoiceDeviceFamily[];
  failed: MioVoiceDeviceFamily[];
}

const REQUIRED:MioVoiceDeviceFamily[]=['ios-safari','desktop-safari','chromium'];

export function evaluateMioVoiceAcceptanceMatrix(cases:MioVoiceAcceptanceCase[]):MioVoiceAcceptanceMatrixResult {
 const missing=REQUIRED.filter(f=>!cases.some(c=>c.deviceFamily===f));
 const failed=REQUIRED.filter(f=>cases.some(c=>c.deviceFamily===f && (c.completedSamples<3 || !c.interruptionRecoveryPassed || !c.longSessionPassed || c.rebufferCount>0 || c.degradedSamples>0)));
 return {ready:missing.length===0&&failed.length===0,missing,failed};
}
