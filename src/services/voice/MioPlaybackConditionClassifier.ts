import type { MioVoiceNetworkCondition } from './MioAdaptiveBufferController';
import type { MioAudioPlaybackTelemetry } from './MioStreamingAudioPlayer';

export interface MioPlaybackCondition {
  condition: MioVoiceNetworkCondition;
  confidence: 'low' | 'medium' | 'high';
  bufferAheadMs: number;
  rebufferCount: number;
  firstAudibleLatencyMs: number | null;
}

export interface MioPlaybackConditionThresholds {
  fastFirstAudibleMs: number;
  constrainedFirstAudibleMs: number;
  healthyBufferAheadMs: number;
  lowBufferAheadMs: number;
}

const DEFAULT_THRESHOLDS: MioPlaybackConditionThresholds = {
  fastFirstAudibleMs: 900,
  constrainedFirstAudibleMs: 2200,
  healthyBufferAheadMs: 2400,
  lowBufferAheadMs: 900,
};

export function classifyMioPlaybackCondition(
  telemetry: MioAudioPlaybackTelemetry,
  thresholds: MioPlaybackConditionThresholds = DEFAULT_THRESHOLDS,
): MioPlaybackCondition {
  const firstAudible = telemetry.firstAudibleLatencyMs;
  const bufferAhead = Math.max(0, telemetry.maxObservedBufferAheadMs);
  const rebuffers = Math.max(0, telemetry.rebufferCount);

  if (telemetry.playbackMode !== 'media-source' || firstAudible === null) {
    return { condition: 'unknown', confidence: 'low', bufferAheadMs: bufferAhead, rebufferCount: rebuffers, firstAudibleLatencyMs: firstAudible };
  }
  if (rebuffers > 0) {
    return { condition: 'constrained', confidence: 'high', bufferAheadMs: bufferAhead, rebufferCount: rebuffers, firstAudibleLatencyMs: firstAudible };
  }
  if (firstAudible >= thresholds.constrainedFirstAudibleMs || bufferAhead < thresholds.lowBufferAheadMs) {
    return { condition: 'constrained', confidence: 'medium', bufferAheadMs: bufferAhead, rebufferCount: rebuffers, firstAudibleLatencyMs: firstAudible };
  }
  if (firstAudible <= thresholds.fastFirstAudibleMs && bufferAhead >= thresholds.healthyBufferAheadMs) {
    return { condition: 'fast', confidence: 'high', bufferAheadMs: bufferAhead, rebufferCount: rebuffers, firstAudibleLatencyMs: firstAudible };
  }
  return { condition: 'stable', confidence: 'medium', bufferAheadMs: bufferAhead, rebufferCount: rebuffers, firstAudibleLatencyMs: firstAudible };
}
