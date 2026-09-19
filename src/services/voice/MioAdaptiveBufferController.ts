export type MioVoiceNetworkCondition = 'fast' | 'stable' | 'constrained' | 'unknown';

export interface MioAdaptiveBufferSample {
  condition: MioVoiceNetworkCondition;
  bufferAheadMs: number;
  rebufferCount: number;
  firstAudibleLatencyMs: number | null;
  nowMs: number;
}

export interface MioAdaptiveBufferDecision {
  targetChunks: number;
  reason: 'initial' | 'increase' | 'decrease' | 'hold' | 'rebuffer-guard';
  cooldownUntilMs: number;
}

export interface MioAdaptiveBufferConfig {
  minChunks: number;
  maxChunks: number;
  increaseThresholdMs: number;
  decreaseThresholdMs: number;
  rebufferGuardCount: number;
  hysteresisSamples: number;
  cooldownMs: number;
}

const DEFAULT_CONFIG: MioAdaptiveBufferConfig = {
  minChunks: 1,
  maxChunks: 4,
  increaseThresholdMs: 900,
  decreaseThresholdMs: 2400,
  rebufferGuardCount: 1,
  hysteresisSamples: 2,
  cooldownMs: 1500,
};

export class MioAdaptiveBufferController {
  private targetChunks: number;
  private pendingDirection: 'increase' | 'decrease' | null = null;
  private pendingSamples = 0;
  private cooldownUntilMs = 0;

  constructor(private readonly config: MioAdaptiveBufferConfig = DEFAULT_CONFIG) {
    if (config.minChunks < 1 || config.maxChunks < config.minChunks) throw new Error('Invalid adaptive buffer bounds.');
    this.targetChunks = config.minChunks;
  }

  getTargetChunks(): number { return this.targetChunks; }

  decide(sample: MioAdaptiveBufferSample): MioAdaptiveBufferDecision {
    const now = Math.max(0, sample.nowMs);
    if (sample.rebufferCount >= this.config.rebufferGuardCount && this.targetChunks < this.config.maxChunks) {
      this.targetChunks += 1;
      this.pendingDirection = null;
      this.pendingSamples = 0;
      this.cooldownUntilMs = now + this.config.cooldownMs;
      return { targetChunks: this.targetChunks, reason: 'rebuffer-guard', cooldownUntilMs: this.cooldownUntilMs };
    }
    if (now < this.cooldownUntilMs) return { targetChunks: this.targetChunks, reason: 'hold', cooldownUntilMs: this.cooldownUntilMs };

    const direction = sample.condition === 'constrained' || sample.bufferAheadMs < this.config.increaseThresholdMs
      ? 'increase'
      : sample.condition === 'fast' && sample.bufferAheadMs > this.config.decreaseThresholdMs
        ? 'decrease'
        : null;

    if (!direction) {
      this.pendingDirection = null;
      this.pendingSamples = 0;
      return { targetChunks: this.targetChunks, reason: 'hold', cooldownUntilMs: this.cooldownUntilMs };
    }

    if (this.pendingDirection !== direction) {
      this.pendingDirection = direction;
      this.pendingSamples = 1;
    } else {
      this.pendingSamples += 1;
    }

    if (this.pendingSamples < this.config.hysteresisSamples) {
      return { targetChunks: this.targetChunks, reason: 'hold', cooldownUntilMs: this.cooldownUntilMs };
    }

    const next = direction === 'increase'
      ? Math.min(this.config.maxChunks, this.targetChunks + 1)
      : Math.max(this.config.minChunks, this.targetChunks - 1);
    this.pendingDirection = null;
    this.pendingSamples = 0;
    if (next === this.targetChunks) return { targetChunks: this.targetChunks, reason: 'hold', cooldownUntilMs: this.cooldownUntilMs };
    this.targetChunks = next;
    this.cooldownUntilMs = now + this.config.cooldownMs;
    return { targetChunks: next, reason: direction, cooldownUntilMs: this.cooldownUntilMs };
  }
}

export const mioAdaptiveBufferController = new MioAdaptiveBufferController();
