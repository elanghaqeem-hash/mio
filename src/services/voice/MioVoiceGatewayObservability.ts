export type MioVoiceGatewayOutcome = 'success' | 'provider-error' | 'timeout' | 'cancelled';

export interface MioVoiceGatewayObservation {
  outcome: MioVoiceGatewayOutcome;
  attempts: number;
  durationMs: number;
  upstreamStatus?: number;
}

export function sanitizeMioVoiceGatewayObservation(input:MioVoiceGatewayObservation):MioVoiceGatewayObservation {
  return {
    outcome: input.outcome,
    attempts: Math.max(1, Math.min(2, Math.trunc(input.attempts))),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    ...(typeof input.upstreamStatus === 'number' ? { upstreamStatus: Math.trunc(input.upstreamStatus) } : {}),
  };
}
// Deliberately excludes text, audio, locale, subject/session identifiers and provider secrets.
