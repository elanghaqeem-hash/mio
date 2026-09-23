import type { MioAudioPlaybackTelemetry } from './MioStreamingAudioPlayer';

export type MioVoiceCalibrationClass = 'excellent' | 'healthy' | 'degraded' | 'fallback';

export interface MioVoiceCalibrationResult {
  class: MioVoiceCalibrationClass;
  firstChunkLatencyMs: number | null;
  firstAudibleLatencyMs: number | null;
  rebufferCount: number;
  bufferAheadMs: number;
  recommendation: 'keep' | 'observe' | 'increase-buffer' | 'fallback-path';
}

/**
 * Device/network calibration is deliberately derived from Mio runtime telemetry,
 * never from speaker identity or biometric characteristics.
 */
export function evaluateMioVoiceCalibration(t: MioAudioPlaybackTelemetry): MioVoiceCalibrationResult {
  const base = {
    firstChunkLatencyMs: t.firstChunkLatencyMs,
    firstAudibleLatencyMs: t.firstAudibleLatencyMs,
    rebufferCount: t.rebufferCount,
    bufferAheadMs: t.maxObservedBufferAheadMs,
  };
  if (t.playbackMode === 'blob-fallback') return { ...base, class: 'fallback', recommendation: 'fallback-path' };
  if (t.rebufferCount > 0 || (t.firstAudibleLatencyMs ?? Infinity) > 2200 || t.maxObservedBufferAheadMs < 900) {
    return { ...base, class: 'degraded', recommendation: 'increase-buffer' };
  }
  if ((t.firstAudibleLatencyMs ?? Infinity) <= 900 && t.maxObservedBufferAheadMs >= 2400) {
    return { ...base, class: 'excellent', recommendation: 'keep' };
  }
  return { ...base, class: 'healthy', recommendation: 'observe' };
}
