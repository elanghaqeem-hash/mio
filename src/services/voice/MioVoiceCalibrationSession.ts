import type { MioVoiceCalibrationResult, MioVoiceCalibrationClass } from './MioVoiceCalibrationProfile';

export interface MioVoiceCalibrationSummary {
  samples: number;
  classes: Record<MioVoiceCalibrationClass, number>;
  averageFirstChunkLatencyMs: number | null;
  averageFirstAudibleLatencyMs: number | null;
  totalRebuffers: number;
  peakBufferAheadMs: number;
}

export class MioVoiceCalibrationSession {
  private readonly results: MioVoiceCalibrationResult[] = [];

  add(result: MioVoiceCalibrationResult): void {
    this.results.push({ ...result });
  }

  reset(): void { this.results.length = 0; }

  summary(): MioVoiceCalibrationSummary {
    const classes: Record<MioVoiceCalibrationClass, number> = { excellent: 0, healthy: 0, degraded: 0, fallback: 0 };
    let firstChunkTotal = 0, firstChunkCount = 0, firstAudibleTotal = 0, firstAudibleCount = 0;
    let totalRebuffers = 0, peakBufferAheadMs = 0;
    for (const r of this.results) {
      classes[r.class] += 1;
      if (r.firstChunkLatencyMs !== null) { firstChunkTotal += r.firstChunkLatencyMs; firstChunkCount += 1; }
      if (r.firstAudibleLatencyMs !== null) { firstAudibleTotal += r.firstAudibleLatencyMs; firstAudibleCount += 1; }
      totalRebuffers += Math.max(0, r.rebufferCount);
      peakBufferAheadMs = Math.max(peakBufferAheadMs, r.bufferAheadMs);
    }
    return {
      samples: this.results.length, classes,
      averageFirstChunkLatencyMs: firstChunkCount ? firstChunkTotal / firstChunkCount : null,
      averageFirstAudibleLatencyMs: firstAudibleCount ? firstAudibleTotal / firstAudibleCount : null,
      totalRebuffers, peakBufferAheadMs,
    };
  }
}

export const mioVoiceCalibrationSession = new MioVoiceCalibrationSession();
