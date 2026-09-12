import { SecurityEvent } from '../types/security';
import { eventBus } from '../core/EventBus';

export class PolicyEngine {
  private static suspiciousPatterns = [
    /ignore (all )?previous instructions/i,
    /system override/i,
    /delete all files/i,
    /rm -rf/i,
    /disable security/i,
    /grant all permissions/i,
    /bypass sandbox/i,
    /<script[\s\S]*?>[\s\S]*?<\/script>/i,
    /javascript:/i,
    /data:text\/html/i,
    /eval\s*\(/i,
  ];

  /**
   * Sanitizes and isolates external/untrusted content to prevent prompt injection.
   * Enforces: SYSTEM INSTRUCTION > USER INSTRUCTION > APP DATA > EXTERNAL CONTENT
   */
  public static sanitizeExternalContent(rawContent: string, source: string = 'web'): {
    sanitized: string;
    suspicious: boolean;
    detectedThreats: string[];
  } {
    const detectedThreats: string[] = [];

    this.suspiciousPatterns.forEach((pattern) => {
      if (pattern.test(rawContent)) {
        detectedThreats.push(pattern.toString());
      }
    });

    const suspicious = detectedThreats.length > 0;

    if (suspicious) {
      const secEvent: SecurityEvent = {
        id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: Date.now(),
        level: 'warning',
        category: 'PROMPT_INJECTION',
        action: 'EXTERNAL_CONTENT_SCAN',
        details: `Potential injection pattern detected from source [${source}]: ${detectedThreats.join(', ')}`,
        blocked: false, // Quarantined and disarmed
      };
      eventBus.emit('SECURITY_EVENT', secEvent);
    }

    // Wrap external content in strict untrusted data boundaries
    const sanitized = `[UNTRUSTED_EXTERNAL_DATA source="${source}"]\n${rawContent.replace(/<\/?script>/gi, '[SCRIPT_BLOCKED]')}\n[/UNTRUSTED_EXTERNAL_DATA]`;

    return { sanitized, suspicious, detectedThreats };
  }

  /**
   * Verifies if an action or prompt attempts to override fundamental system safety.
   */
  public static validateInstruction(instruction: string): { allowed: boolean; reason?: string } {
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(instruction)) {
        const secEvent: SecurityEvent = {
          id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          timestamp: Date.now(),
          level: 'blocked',
          category: 'PROMPT_INJECTION',
          action: 'INSTRUCTION_VALIDATION',
          details: `Direct system safety override attempt blocked: ${pattern.toString()}`,
          blocked: true,
        };
        eventBus.emit('SECURITY_EVENT', secEvent);
        return { allowed: false, reason: `Policy Engine Violation: Suspicious pattern detected (${pattern})` };
      }
    }
    return { allowed: true };
  }
}
