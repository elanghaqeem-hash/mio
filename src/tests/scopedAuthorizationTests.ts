import { eventBus } from '../core/EventBus';
import { emergencyStop } from '../core/EmergencyStop';
import { PermissionEngine } from '../security/PermissionEngine';
import type { AuthorizationScope, DryRunRequest } from '../types/security';

interface SuiteResult { passed: number; total: number; }

export async function runScopedAuthorizationTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`ScopedAuthorization test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  emergencyStop.reset();
  PermissionEngine.clearForTests();

  const dryRuns: DryRunRequest[] = [];
  const autoApprove = eventBus.on<DryRunRequest>('REQUEST_DRY_RUN_PERMISSION', (request) => {
    dryRuns.push(request);
    request.onApprove();
  });

  const taskId = `auth_task_${Date.now()}`;
  const projectId = 'project-alpha';
  const exactScope: AuthorizationScope = {
    taskId,
    projectId,
    action: 'MODEL_PROVIDER:openai',
    target: 'MIO AI Inference',
    resourceId: 'model-provider:openai',
    networkOrigin: 'https://mio.example.test',
    networkAllowed: true,
  };

  const grant = await PermissionEngine.requestScopedPermission({
    action: exactScope.action,
    target: exactScope.target,
    level: 'L4_EXECUTE',
    changes: ['Send bounded inference request'],
    risks: ['Prompt leaves local runtime'],
    expectedResult: 'One remote inference response',
    taskId,
    projectId,
    resourceId: exactScope.resourceId,
    networkAccess: true,
    networkOrigin: exactScope.networkOrigin,
    maxUses: 1,
    ttlMs: 30_000,
    forceDryRun: true,
  });

  check(Boolean(grant) && dryRuns.length === 1, 'L4 remote execution requires an explicit dry-run approval');
  check(Boolean(grant && PermissionEngine.validateGrant(grant.id, exactScope)), 'Approved grant validates only against its exact authorized scope');
  check(dryRuns[0]?.scopeSummary?.some((line) => line.includes(projectId)) === true && dryRuns[0]?.scopeSummary?.some((line) => line.includes('mio.example.test')) === true, 'Dry-run disclosure surfaces project and network-origin boundaries');

  const wrongTask = { ...exactScope, taskId: `${taskId}_other` };
  const wrongProject = { ...exactScope, projectId: 'project-beta' };
  const wrongOrigin = { ...exactScope, networkOrigin: 'https://evil.example.test' };
  check(Boolean(grant) && !PermissionEngine.validateGrant(grant!.id, wrongTask) && !PermissionEngine.validateGrant(grant!.id, wrongProject) && !PermissionEngine.validateGrant(grant!.id, wrongOrigin), 'Task, project, and network-origin scope escalation is rejected');

  const consumed = grant ? PermissionEngine.consumeGrant(grant.id, exactScope) : null;
  check(Boolean(consumed) && consumed?.uses === 1 && consumed.revoked === true, 'Single-use grant is consumed exactly once at the execution boundary');
  check(Boolean(grant) && !PermissionEngine.validateGrant(grant!.id, exactScope), 'Consumed one-shot grant cannot authorize a second execution');

  PermissionEngine.clearForTests();
  const reusableScope: AuthorizationScope = {
    taskId: 'bounded-reuse-task',
    projectId: 'project-alpha',
    action: 'PROJECT:READ',
    target: 'Project project-alpha',
    resourceId: 'project:project-alpha',
    networkAllowed: false,
  };
  const reusableFirst = await PermissionEngine.requestScopedPermission({
    action: reusableScope.action,
    target: reusableScope.target,
    level: 'L1_SUGGEST',
    changes: ['Read project metadata'],
    risks: [],
    expectedResult: 'Project metadata only',
    taskId: reusableScope.taskId,
    projectId: reusableScope.projectId,
    resourceId: reusableScope.resourceId,
    maxUses: 2,
  });
  const firstUse = reusableFirst ? PermissionEngine.consumeGrant(reusableFirst.id, reusableScope) : null;
  const reusableSecond = await PermissionEngine.requestScopedPermission({
    action: reusableScope.action,
    target: reusableScope.target,
    level: 'L1_SUGGEST',
    changes: ['Read project metadata'],
    risks: [],
    expectedResult: 'Project metadata only',
    taskId: reusableScope.taskId,
    projectId: reusableScope.projectId,
    resourceId: reusableScope.resourceId,
    maxUses: 2,
  });
  check(Boolean(firstUse && reusableSecond && reusableFirst?.id === reusableSecond.id), 'Bounded grant reuse is permitted only for the same scope while use budget remains');
  const secondUse = reusableSecond ? PermissionEngine.consumeGrant(reusableSecond.id, reusableScope) : null;
  check(Boolean(secondUse?.revoked) && PermissionEngine.getActiveGrants(reusableScope.taskId).length === 0, 'Reuse budget exhaustion removes the grant from active authorization');

  autoApprove();
  PermissionEngine.clearForTests();
  const sessionDryRuns: DryRunRequest[] = [];
  const approveSession = eventBus.on<DryRunRequest>('REQUEST_DRY_RUN_PERMISSION', (request) => {
    sessionDryRuns.push(request);
    request.onApproveSession?.();
  });
  const sessionRequest = (task: string) => PermissionEngine.requestScopedPermission({
    action: 'MODEL_PROVIDER:openrouter', target: 'MIO AI Inference', level: 'L4_EXECUTE',
    changes: ['Send matching prompts to OpenRouter'], risks: ['Prompt leaves local runtime'], expectedResult: 'Remote response',
    taskId: task, projectId: 'project-alpha', resourceId: 'model-provider:openrouter', networkAccess: true,
    networkOrigin: 'https://mio.example.test', maxUses: 1, ttlMs: 30_000, forceDryRun: true,
    allowSessionGrant: true, sessionMaxUses: 60, sessionIdleTtlMs: 15 * 60_000, sessionAbsoluteTtlMs: 60 * 60_000,
  });
  const sessionGrant = await sessionRequest('session-task-a');
  check(Boolean(sessionGrant?.reusableAcrossTasks) && sessionGrant?.maxUses === 60 && sessionDryRuns.length === 1, 'User can explicitly approve an L4 provider session for at most 60 matching requests');
  check(sessionGrant?.idleTtlMs === 15 * 60_000 && Boolean(sessionGrant.absoluteExpiresAt && sessionGrant.absoluteExpiresAt > sessionGrant.expiresAt), 'Session grant carries a 15-minute idle limit and a separate absolute lifetime');
  const firstSessionUse = sessionGrant ? PermissionEngine.consumeGrant(sessionGrant.id, { ...sessionGrant.scope, taskId: 'session-task-a' }) : null;
  const reusedSessionGrant = await sessionRequest('session-task-b');
  check(Boolean(firstSessionUse && reusedSessionGrant && reusedSessionGrant.id === sessionGrant?.id && sessionDryRuns.length === 1), 'Matching provider scope reuses the session grant across chat task IDs without another prompt');
  check(Boolean(reusedSessionGrant && PermissionEngine.validateGrant(reusedSessionGrant.id, { ...reusedSessionGrant.scope, taskId: 'session-task-b' })), 'Session grant authorizes a new task only inside the same project, provider, resource, and origin boundary');
  check(Boolean(reusedSessionGrant && !PermissionEngine.validateGrant(reusedSessionGrant.id, { ...reusedSessionGrant.scope, taskId: 'session-task-b', projectId: 'project-beta' })), 'Session grant cannot cross its approved project boundary');
  check(PermissionEngine.revokeTaskGrants('session-task-a', 'Original task completed') === 0 && PermissionEngine.getActiveGrants().length === 1, 'Completing one task does not revoke an explicitly approved matching session grant');
  check(PermissionEngine.revokeSessionGrants('Routing changed') === 1 && PermissionEngine.getActiveGrants().length === 0, 'Routing changes can revoke all session grants immediately');
  approveSession();

  PermissionEngine.clearForTests();
  const stoppable = await PermissionEngine.requestScopedPermission({
    action: 'PROJECT:READ', target: 'Project project-alpha', level: 'L1_SUGGEST',
    changes: ['Read metadata'], risks: [], expectedResult: 'Metadata',
    taskId: 'stop-task', projectId: 'project-alpha', resourceId: 'project:project-alpha', maxUses: 2,
  });
  emergencyStop.triggerEmergencyStop('Scoped authorization test STOP');
  check(Boolean(stoppable) && PermissionEngine.getActiveGrants().length === 0 && !PermissionEngine.validateGrant(stoppable!.id, {
    taskId: 'stop-task', projectId: 'project-alpha', action: 'PROJECT:READ', target: 'Project project-alpha', resourceId: 'project:project-alpha', networkAllowed: false,
  }), 'STOP MIO revokes all active scoped authorization grants');
  emergencyStop.reset();

  PermissionEngine.clearForTests();
  return { passed, total };
}
