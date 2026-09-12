import { AuthorizationGrant, AuthorizationScope, DryRunRequest, ScopedPermissionRequest, SecurityEvent } from '../types/security';
import { eventBus } from '../core/EventBus';

const DEFAULT_GRANT_TTL_MS = 60_000;
const MAX_GRANT_TTL_MS = 5 * 60_000;

export class PermissionEngine {
  private static grants: Map<string, AuthorizationGrant> = new Map();

  public static async requestPermission(request: ScopedPermissionRequest): Promise<boolean> {
    const grant = await this.requestScopedPermission(request);
    return Boolean(grant);
  }

  public static async requestScopedPermission(request: ScopedPermissionRequest): Promise<AuthorizationGrant | null> {
    this.pruneExpired();
    const scope = this.buildScope(request);

    if (request.level === 'L0_OBSERVE' || request.level === 'L1_SUGGEST' || request.level === 'L2_CREATE' || request.level === 'L3_MODIFY') {
      const grant = this.issueGrant(request, scope, 'AUTO_POLICY');
      eventBus.emit('ACTIVITY_LOG', {
        timestamp: Date.now(),
        message: `Authorized ${request.level} scoped action ${request.action} for task ${scope.taskId}`,
        mode: 'PROJECT',
      });
      return grant;
    }

    return new Promise((resolve) => {
      const ttlMs = this.normalizeTtl(request.ttlMs);
      const dryRun: DryRunRequest = {
        id: `perm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        proposedAction: request.action,
        target: request.target,
        changes: request.changes,
        risks: request.risks,
        expectedResult: request.expectedResult,
        permissionLevel: request.level,
        taskId: request.taskId,
        projectId: request.projectId,
        toolId: request.toolId,
        expiresInMs: ttlMs,
        onApprove: () => {
          const grant = this.issueGrant({ ...request, ttlMs }, scope, 'USER_APPROVAL');
          this.emitPermissionEvent(request, scope, false, `User explicitly approved ${request.level} scoped action until ${new Date(grant.expiresAt).toISOString()}`);
          resolve(grant);
        },
        onReview: () => {
          this.emitPermissionEvent(request, scope, true, 'User requested review instead of execution');
          resolve(null);
        },
        onCancel: () => {
          this.emitPermissionEvent(request, scope, true, `User rejected ${request.level} scoped action`);
          resolve(null);
        },
      };
      eventBus.emit('REQUEST_DRY_RUN_PERMISSION', dryRun);
    });
  }

  public static validateGrant(grantId: string, required: AuthorizationScope): boolean {
    this.pruneExpired();
    const grant = this.grants.get(grantId);
    if (!grant || grant.revoked || grant.expiresAt <= Date.now()) return false;
    const scope = grant.scope;
    if (scope.taskId !== required.taskId) return false;
    if (scope.action !== required.action || scope.target !== required.target) return false;
    if (required.projectId && scope.projectId !== required.projectId) return false;
    if (required.toolId && scope.toolId !== required.toolId) return false;
    if (required.networkAllowed === true && scope.networkAllowed !== true) return false;
    return true;
  }

  public static getGrant(grantId: string): AuthorizationGrant | undefined {
    this.pruneExpired();
    const grant = this.grants.get(grantId);
    return grant ? { ...grant, scope: { ...grant.scope } } : undefined;
  }

  public static revokeGrant(grantId: string, reason: string = 'Grant revoked'): boolean {
    const grant = this.grants.get(grantId);
    if (!grant || grant.revoked) return false;
    grant.revoked = true;
    eventBus.emit<SecurityEvent>('SECURITY_EVENT', {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level: 'warning',
      category: 'PERMISSION',
      action: grant.scope.action,
      details: `${reason}; task=${grant.scope.taskId}; grant=${grant.id}`,
      blocked: true,
    });
    return true;
  }

  public static revokeTaskGrants(taskId: string, reason: string = 'Task authorization revoked'): number {
    let revoked = 0;
    for (const grant of this.grants.values()) {
      if (grant.scope.taskId === taskId && !grant.revoked) {
        grant.revoked = true;
        revoked += 1;
      }
    }
    if (revoked > 0) {
      eventBus.emit<SecurityEvent>('SECURITY_EVENT', {
        id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        level: 'warning',
        category: 'PERMISSION',
        action: 'REVOKE_TASK_GRANTS',
        details: `${reason}; task=${taskId}; revoked=${revoked}`,
        blocked: true,
      });
    }
    return revoked;
  }

  public static revokeAll(reason: string = 'All authorization grants revoked'): number {
    let revoked = 0;
    for (const grant of this.grants.values()) {
      if (!grant.revoked) {
        grant.revoked = true;
        revoked += 1;
      }
    }
    if (revoked > 0) {
      eventBus.emit<SecurityEvent>('SECURITY_EVENT', {
        id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        level: 'blocked',
        category: 'PERMISSION',
        action: 'REVOKE_ALL_GRANTS',
        details: `${reason}; revoked=${revoked}`,
        blocked: true,
      });
    }
    return revoked;
  }

  public static clearForTests(): void {
    this.grants.clear();
  }

  private static buildScope(request: ScopedPermissionRequest): AuthorizationScope {
    return {
      taskId: request.taskId ?? `legacy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: request.projectId,
      action: request.action,
      target: request.target,
      toolId: request.toolId,
      networkAllowed: request.networkAccess === true,
    };
  }

  private static issueGrant(request: ScopedPermissionRequest, scope: AuthorizationScope, source: AuthorizationGrant['source']): AuthorizationGrant {
    const now = Date.now();
    const grant: AuthorizationGrant = {
      id: `grant_${now}_${Math.random().toString(36).slice(2, 8)}`,
      level: request.level,
      scope,
      grantedAt: now,
      expiresAt: now + this.normalizeTtl(request.ttlMs),
      revoked: false,
      source,
    };
    this.grants.set(grant.id, grant);
    return { ...grant, scope: { ...grant.scope } };
  }

  private static normalizeTtl(ttlMs?: number): number {
    if (!Number.isFinite(ttlMs)) return DEFAULT_GRANT_TTL_MS;
    return Math.min(MAX_GRANT_TTL_MS, Math.max(1_000, Math.floor(ttlMs!)));
  }

  private static pruneExpired(): void {
    const now = Date.now();
    for (const [id, grant] of this.grants.entries()) {
      if (grant.expiresAt <= now || grant.revoked) this.grants.delete(id);
    }
  }

  private static emitPermissionEvent(request: ScopedPermissionRequest, scope: AuthorizationScope, blocked: boolean, details: string): void {
    eventBus.emit<SecurityEvent>('SECURITY_EVENT', {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level: blocked ? 'warning' : 'info',
      category: 'PERMISSION',
      action: request.action,
      details: `${details}; task=${scope.taskId}; target=${scope.target}`,
      blocked,
    });
  }
}
