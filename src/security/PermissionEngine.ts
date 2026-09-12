import { PermissionLevel, DryRunRequest, SecurityEvent } from '../types/security';
import { eventBus } from '../core/EventBus';

const PERMISSION_DECISION_TIMEOUT_MS = 120000;

export class PermissionEngine {
  public static async requestPermission(request: {
    action: string;
    target: string;
    level: PermissionLevel;
    changes: string[];
    risks: string[];
    expectedResult: string;
  }): Promise<boolean> {
    if (request.level === 'L0_OBSERVE' || request.level === 'L1_SUGGEST') return true;

    if (request.level === 'L2_CREATE' || request.level === 'L3_MODIFY') {
      eventBus.emit('ACTIVITY_LOG', {
        timestamp: Date.now(),
        message: `Authorized ${request.level} action on ${request.target}`,
        mode: 'PROJECT',
      });
      return true;
    }

    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };

      const dryRun: DryRunRequest = {
        id: `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        proposedAction: request.action.slice(0, 240),
        target: request.target.slice(0, 500),
        changes: request.changes.slice(0, 50).map((item) => String(item).slice(0, 1000)),
        risks: request.risks.slice(0, 50).map((item) => String(item).slice(0, 1000)),
        expectedResult: request.expectedResult.slice(0, 1000),
        permissionLevel: request.level,
        onApprove: () => {
          const secEvent: SecurityEvent = {
            id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            level: 'info',
            category: 'PERMISSION',
            action: request.action,
            details: `User explicitly approved ${request.level} action on ${request.target}`,
            blocked: false,
          };
          eventBus.emit('SECURITY_EVENT', secEvent);
          settle(true);
        },
        onReview: () => settle(false),
        onCancel: () => {
          eventBus.emit('SECURITY_EVENT', {
            id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            level: 'warning',
            category: 'PERMISSION',
            action: request.action,
            details: `User rejected ${request.level} action on ${request.target}`,
            blocked: true,
          } satisfies SecurityEvent);
          settle(false);
        },
      };

      const timer = setTimeout(() => {
        eventBus.emit('SECURITY_EVENT', {
          id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          level: 'warning',
          category: 'PERMISSION',
          action: request.action,
          details: `Permission request timed out after ${PERMISSION_DECISION_TIMEOUT_MS / 1000}s and was denied by default`,
          blocked: true,
        } satisfies SecurityEvent);
        settle(false);
      }, PERMISSION_DECISION_TIMEOUT_MS);

      eventBus.emit('REQUEST_DRY_RUN_PERMISSION', dryRun);
    });
  }
}
