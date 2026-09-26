import type { MioVoiceCalibrationSummary } from './MioVoiceCalibrationSession';

export type MioVoiceDeviceFamily = 'ios-safari' | 'desktop-safari' | 'chromium' | 'firefox' | 'other';

export interface MioVoiceDeviceValidationInput {
  deviceFamily: MioVoiceDeviceFamily;
  summary: MioVoiceCalibrationSummary;
  interruptionRecoveryPassed: boolean;
  longSessionPassed: boolean;
}

export interface MioVoiceDeviceValidationResult {
  ready: boolean;
  blockers: string[];
}

export function validateMioVoiceDevice(input: MioVoiceDeviceValidationInput): MioVoiceDeviceValidationResult {
  const blockers:string[]=[];
  if (input.summary.samples < 3) blockers.push('insufficient-completed-samples');
  if (!input.interruptionRecoveryPassed) blockers.push('interruption-recovery');
  if (!input.longSessionPassed) blockers.push('long-session-stability');
  if (input.summary.totalRebuffers > 0) blockers.push('rebuffer-observed');
  if (input.summary.classes.degraded > 0) blockers.push('degraded-playback');
  // Fallback is expected on some device/browser paths and is evidence, not by itself a release blocker.
  return { ready: blockers.length === 0, blockers };
}
