import { PermissionLevel, DryRunRequest, SecurityEvent } from '../types/security';
import { eventBus } from '../core/EventBus';

export class PermissionEngine {
  private static userGrants: Map<string, boolean> = new Map();

  /**
   * Request permission for an operation based on hierarchy L0 to L5.
   * L0 (Observe): Auto-allowed
   * L1 (Suggest): Auto-allowed
   * L2 (Create): Allowed in sandbox
   * L3 (Modify): Allowed with project context
   * L4 (Execute): Verified tool execution
   * L5 (Destructive): Explicit Human-In-The-Loop confirmation required
   */
  public static async requestPermission(request: {
    action: string;
    target: string;
    level: PermissionLevel;
    changes: string[];
    risks: string[];
    expectedResult: string;
  }): Promise<boolean> {
    // L0, L1: Always allowed
    if (request.level === 'L0_OBSERVE' || request.level === 'L1_SUGGEST') {
      return true;
    }

    // L2, L3, L4: Allowed if within sandbox, but logged
    if (request.level === 'L2_CREATE' || request.level === 'L3_MODIFY') {
      eventBus.emit('ACTIVITY_LOG', {
        timestamp: Date.now(),
        message: `Authorized ${request.level} action on ${request.target}`,
        mode: 'PROJECT',
      });
      return true;
    }

    // For L4/L5, trigger Dry-Run / Preview dialog
    return new Promise((resolve) => {
      const dryRun: DryRunRequest = {
        id: `perm_${Date.now()}`,
        proposedAction: request.action,
        target: request.target,
        changes: request.changes,
        risks: request.risks,
        expectedResult: request.expectedResult,
        permissionLevel: request.level,
        onApprove: () => {
          const secEvent: SecurityEvent = {
            id: `sec_${Date.now()}`,
            timestamp: Date.now(),
            level: 'info',
            category: 'PERMISSION',
            action: request.action,
            details: `User explicitly approved ${request.level} action on ${request.target}`,
            blocked: false,
          };
          eventBus.emit('SECURITY_EVENT', secEvent);
          resolve(true);
        },
        onReview: () => {
          // Open in review mode
          resolve(false);
        },
        onCancel: () => {
          const secEvent: SecurityEvent = {
            id: `sec_${Date.now()}`,
            timestamp: Date.now(),
            level: 'warning',
            category: 'PERMISSION',
            action: request.action,
            details: `User rejected ${request.level} action on ${request.target}`,
            blocked: true,
          };
          eventBus.emit('SECURITY_EVENT', secEvent);
          resolve(false);
        },
      };

      eventBus.emit('REQUEST_DRY_RUN_PERMISSION', dryRun);
    });
  }
}
