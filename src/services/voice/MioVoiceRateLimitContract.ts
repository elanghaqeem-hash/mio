export interface MioVoiceRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface MioVoiceRateLimiter {
  /**
   * Implementations must use a shared/distributed store in multi-isolate production.
   * Never rely on module-local counters for enforcement.
   */
  consume(key: string, cost?: number): Promise<MioVoiceRateLimitDecision>;
}

export function mioVoiceRateLimitKey(subject:string | null):string {
  const normalized=subject?.trim();
  return normalized ? `subject:${normalized}` : 'anonymous';
}

export function normalizeMioVoiceRateLimitDecision(d:MioVoiceRateLimitDecision):MioVoiceRateLimitDecision {
  if (d.allowed) return {allowed:true};
  return {allowed:false,retryAfterSeconds:Math.max(1,Math.min(3600,Math.ceil(d.retryAfterSeconds ?? 60)))};
}
