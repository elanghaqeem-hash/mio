import { eventBus } from '../core/EventBus';
import { emergencyStop } from '../core/EmergencyStop';
import type { TaskRuntimeEvent } from '../types/tasks';
import { AuthorizationGrant, AuthorizationScope, DryRunRequest, ScopedPermissionRequest, SecurityEvent } from '../types/security';

const DEFAULT_GRANT_TTL_MS = 60_000;
const MAX_GRANT_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_USES = 2;
const MAX_GRANT_USES = 10;

export class PermissionEngine {
  private static grants: Map<string, AuthorizationGrant> = new Map();

  public static async requestPermission(request: ScopedPermissionRequest): Promise<boolean> {
    return Boolean(await this.requestScopedPermission(request));
  }

  public static async requestScopedPermission(request: ScopedPermissionRequest): Promise<AuthorizationGrant | null> {
    this.pruneExpired();
    const scope = this.buildScope(request);

    const reusable = this.findReusableGrant(request.level, scope);
    if (reusable) {
      const consumed = this.consumeGrant(reusable.id, scope);
      if (consumed) {
        this.emitPermissionEvent(request, scope, false, `Reused bounded grant ${consumed.id}; use=${consumed.uses}/${consumed.maxUses}`);
        return consumed;
      }
    }

    const forceDryRun = request.forceDryRun === true || request.level === 'L4_EXECUTE' || request.level === 'L5_DESTRUCTIVE';
    if (!forceDryRun) {
      const grant = this.issueGrant(request, scope, 'AUTO_POLICY');
      this.emitPermissionEvent(request, scope, false, `System policy issued scoped grant ${grant.id}; use=${grant.uses}/${grant.maxUses}`);
      return grant;
    }

    return new Promise((resolve) => {
      const ttlMs = request.level === 'L5_DESTRUCTIVE' ? Math.min(30_000, this.normalizeTtl(request.ttlMs)) : this.normalizeTtl(request.ttlMs);
      const maxUses = request.level === 'L5_DESTRUCTIVE' ? 1 : this.normalizeMaxUses(request.maxUses);
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
        scopeSummary: this.scopeSummary(scope),
        expiresInMs: ttlMs,
        maxUses,
        onApprove: () => {
          const grant = this.issueGrant({ ...request, ttlMs, maxUses }, scope, 'USER_APPROVAL');
          this.emitPermissionEvent(request, scope, false, `User approved bounded grant ${grant.id}; expires=${new Date(grant.expiresAt).toISOString()}; use=${grant.uses}/${grant.maxUses}`);
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
    return Boolean(grant && this.grantCanAuthorize(grant, required));
  }

  public static consumeGrant(grantId: string, required: AuthorizationScope): AuthorizationGrant | null {
    this.pruneExpired();
    const grant = this.grants.get(grantId);
    if (!grant || !this.grantCanAuthorize(grant, required)) return null;
    grant.uses += 1;
    if (grant.uses >= grant.maxUses) {
      grant.revoked = true;
      grant.revokeReason = 'Grant use limit exhausted';
    }
    return this.cloneGrant(grant);
  }

  public static getGrant(grantId: string): AuthorizationGrant | undefined {
    this.pruneExpired();
    const grant = this.grants.get(grantId);
    return grant ? this.cloneGrant(grant) : undefined;
  }

  public static getActiveGrants(taskId?: string): AuthorizationGrant[] {
    this.pruneExpired();
    return [...this.grants.values()]
      .filter((grant) => !grant.revoked && (!taskId || grant.scope.taskId === taskId))
      .map((grant) => this.cloneGrant(grant));
  }

  public static revokeGrant(grantId: string, reason: string = 'Grant revoked'): boolean {
    const grant = this.grants.get(grantId);
    if (!grant || grant.revoked) return false;
    grant.revoked = true;
    grant.revokeReason = reason;
    this.emitSecurityEvent('warning', 'REVOKE_GRANT', `${reason}; task=${grant.scope.taskId}; grant=${grant.id}`, true);
    eventBus.emit('AUTHORIZATION_GRANTS_UPDATED', this.getActiveGrants());
    return true;
  }

  public static revokeTaskGrants(taskId: string, reason: string = 'Task authorization revoked'): number {
    let revoked = 0;
    for (const grant of this.grants.values()) {
      if (grant.scope.taskId === taskId && !grant.revoked) {
        grant.revoked = true;
        grant.revokeReason = reason;
        revoked += 1;
      }
    }
    if (revoked > 0) {
      this.emitSecurityEvent('warning', 'REVOKE_TASK_GRANTS', `${reason}; task=${taskId}; revoked=${revoked}`, true);
      eventBus.emit('AUTHORIZATION_GRANTS_UPDATED', this.getActiveGrants());
    }
    return revoked;
  }

  public static revokeAll(reason: string = 'All authorization grants revoked'): number {
    let revoked = 0;
    for (const grant of this.grants.values()) {
      if (!grant.revoked) {
        grant.revoked = true;
        grant.revokeReason = reason;
        revoked += 1;
      }
    }
    if (revoked > 0) {
      this.emitSecurityEvent('blocked', 'REVOKE_ALL_GRANTS', `${reason}; revoked=${revoked}`, true);
      eventBus.emit('AUTHORIZATION_GRANTS_UPDATED', []);
    }
    return revoked;
  }

  public static clearForTests(): void {
    this.grants.clear();
    eventBus.emit('AUTHORIZATION_GRANTS_UPDATED', []);
  }

  private static buildScope(request: ScopedPermissionRequest): AuthorizationScope {
    return {
      taskId: request.taskId ?? `legacy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: request.projectId,
      action: request.action,
      target: request.target,
      toolId: request.toolId,
      networkOrigin: request.networkOrigin,
      resourceId: request.resourceId,
      path: request.path,
      networkAllowed: request.networkAccess === true,
    };
  }

  private static issueGrant(request: ScopedPermissionRequest, scope: AuthorizationScope, source: AuthorizationGrant['source']): AuthorizationGrant {
    const now = Date.now();
    const maxUses = request.level === 'L5_DESTRUCTIVE' ? 1 : this.normalizeMaxUses(request.maxUses);
    const ttlMs = request.level === 'L5_DESTRUCTIVE' ? Math.min(30_000, this.normalizeTtl(request.ttlMs)) : this.normalizeTtl(request.ttlMs);
    const grant: AuthorizationGrant = {
      id: `grant_${now}_${Math.random().toString(36).slice(2, 8)}`,
      level: request.level,
      scope,
      grantedAt: now,
      expiresAt: now + ttlMs,
      revoked: false,
      source,
      maxUses,
      uses: 1,
      requiresDryRun: source === 'USER_APPROVAL',
    };
    if (grant.uses >= grant.maxUses) {
      grant.revoked = true;
      grant.revokeReason = 'Grant use limit exhausted by approved action';
    }
    this.grants.set(grant.id, grant);
    eventBus.emit('AUTHORIZATION_GRANTS_UPDATED', this.getActiveGrants());
    return this.cloneGrant(grant);
  }

  private static findReusableGrant(level: AuthorizationGrant['level'], scope: AuthorizationScope): AuthorizationGrant | undefined {
    return [...this.grants.values()].find((grant) => grant.level === level && this.grantCanAuthorize(grant, scope));
  }

  private static grantCanAuthorize(grant: AuthorizationGrant, required: AuthorizationScope): boolean {
    if (grant.revoked || grant.expiresAt <= Date.now() || grant.uses >= grant.maxUses) return false;
    const scope = grant.scope;
    if (scope.taskId !== required.taskId) return false;
    if (scope.action !== required.action || scope.target !== required.target) return false;
    if (required.projectId && scope.projectId !== required.projectId) return false;
    if (required.toolId && scope.toolId !== required.toolId) return false;
    if (required.networkOrigin && scope.networkOrigin !== required.networkOrigin) return false;
    if (required.resourceId && scope.resourceId !== required.resourceId) return false;
    if (required.path && scope.path !== required.path) return false;
    if (required.networkAllowed === true && scope.networkAllowed !== true) return false;
    return true;
  }

  private static normalizeTtl(ttlMs?: number): number {
    if (!Number.isFinite(ttlMs)) return DEFAULT_GRANT_TTL_MS;
    return Math.min(MAX_GRANT_TTL_MS, Math.max(1_000, Math.floor(ttlMs!)));
  }

  private static normalizeMaxUses(maxUses?: number): number {
    if (!Number.isFinite(maxUses)) return DEFAULT_MAX_USES;
    return Math.min(MAX_GRANT_USES, Math.max(1, Math.floor(maxUses!)));
  }

  private static pruneExpired(): void {
    const now = Date.now();
    let changed = false;
    for (const grant of this.grants.values()) {
      if (!grant.revoked && grant.expiresAt <= now) {
        grant.revoked = true;
        grant.revokeReason = 'Grant expired';
        changed = true;
      }
    }
    if (changed) eventBus.emit('AUTHORIZATION_GRANTS_UPDATED', this.getActiveGrants());
  }

  private static scopeSummary(scope: AuthorizationScope): string[] {
    return [
      `Task: ${scope.taskId}`,
      scope.projectId ? `Project: ${scope.projectId}` : undefined,
      scope.toolId ? `Tool: ${scope.toolId}` : undefined,
      scope.networkOrigin ? `Network origin: ${scope.networkOrigin}` : undefined,
      scope.resourceId ? `Resource: ${scope.resourceId}` : undefined,
      scope.path ? `Path: ${scope.path}` : undefined,
      scope.networkAllowed ? 'Network access: allowed within this scope' : undefined,
    ].filter((value): value is string => Boolean(value));
  }

  private static cloneGrant(grant: AuthorizationGrant): AuthorizationGrant {
    return { ...grant, scope: { ...grant.scope } };
  }

  private static emitPermissionEvent(request: ScopedPermissionRequest, scope: AuthorizationScope, blocked: boolean, details: string): void {
    this.emitSecurityEvent(blocked ? 'warning' : 'info', request.action, `${details}; task=${scope.taskId}; target=${scope.target}`, blocked);
  }

  private static emitSecurityEvent(level: SecurityEvent['level'], action: string, details: string, blocked: boolean): void {
    eventBus.emit<SecurityEvent>('SECURITY_EVENT', {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level,
      category: 'PERMISSION',
      action,
      details,
      blocked,
    });
  }
}

emergencyStop.registerAbortHandler(() => PermissionEngine.revokeAll('STOP MIO revoked all active authorization grants'));
eventBus.on<TaskRuntimeEvent>('TASK_RUNTIME_EVENT', (event) => {
  if (event.type === 'COMPLETED' || event.type === 'FAILED' || event.type === 'CANCELLED') {
    PermissionEngine.revokeTaskGrants(event.taskId, `Task entered terminal state ${event.type}`);
  }
});
