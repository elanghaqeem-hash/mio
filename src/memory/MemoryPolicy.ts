import { MemoryItem } from '../types/security';

export type MemoryPolicyDecision = 'ALLOW' | 'REVIEW' | 'DENY';

export interface MemoryPolicyResult {
  decision: MemoryPolicyDecision;
  reason: string;
}

export class MemoryPolicy {
  private static readonly externalSourcePatterns = [
    /web/i,
    /internet/i,
    /external/i,
    /untrusted/i,
    /document/i,
    /attachment/i,
    /search/i,
  ];

  public static evaluateWrite(item: Omit<MemoryItem, 'id' | 'timestamp'>): MemoryPolicyResult {
    if (!item.content.trim()) {
      return { decision: 'DENY', reason: 'Empty memory content is not allowed.' };
    }

    if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
      return { decision: 'DENY', reason: 'Memory confidence must be between 0 and 1.' };
    }

    if (this.externalSourcePatterns.some((pattern) => pattern.test(item.source))) {
      return {
        decision: 'REVIEW',
        reason: 'External or untrusted information cannot write directly to long-term memory.',
      };
    }

    return { decision: 'ALLOW', reason: 'Trusted memory source accepted by policy.' };
  }
}
