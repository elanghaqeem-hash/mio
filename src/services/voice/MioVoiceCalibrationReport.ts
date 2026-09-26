import type { MioVoiceCalibrationSummary } from './MioVoiceCalibrationSession';

export interface MioVoiceCalibrationReport {
  status: 'insufficient-data' | 'ready';
  summary: MioVoiceCalibrationSummary;
  notes: string[];
}

export function buildMioVoiceCalibrationReport(summary: MioVoiceCalibrationSummary): MioVoiceCalibrationReport {
  const notes:string[]=[];
  if (summary.samples < 3) notes.push('Collect at least 3 completed MediaSource playback samples before tuning thresholds.');
  if (summary.totalRebuffers > 0) notes.push('Rebuffering was observed; review network/device conditions before lowering prebuffer.');
  if (summary.classes.degraded > 0) notes.push('Degraded MediaSource playback was observed.');
  if (summary.classes.fallback > 0) notes.push('Fallback samples are reported separately and must not drive MediaSource threshold tuning.');
  if (!notes.length) notes.push('No immediate calibration warning detected; retain conservative production thresholds.');
  return { status: summary.samples >= 3 ? 'ready' : 'insufficient-data', summary, notes };
}
