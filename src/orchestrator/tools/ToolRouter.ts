import { eventBus } from '../../core/EventBus';
import { defaultCapabilityRegistry, CapabilityRegistry } from '../../security/CapabilityRegistry';
import { taskRuntime } from '../TaskRuntime';
import { resourceGovernor } from '../../security/ResourceGovernor';
import { PermissionEngine } from '../../security/PermissionEngine';
import { PolicyEngine } from '../../security/PolicyEngine';
import { RiskAnalyzer } from '../../security/RiskAnalyzer';
import { Sandbox } from '../../security/Sandbox';
import { SecurityEvent } from '../../types/security';
import { ToolExecutionContext, ToolResult } from '../../types/tools';
import { ToolRegistry } from './ToolRegistry';

export class ToolRouter {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly capabilities: CapabilityRegistry = defaultCapabilityRegistry,
  ) {}

  public async execute<T = unknown>(toolId: string, input: unknown, context: ToolExecutionContext): Promise<ToolResult<T>> {
    const startedAt = Date.now();
    const tool = this.registry.get(toolId);

    if (!tool) {
      this.audit('blocked', 'TOOL_EXECUTION', toolId, `Unknown tool '${toolId}' rejected`, true);
      return { success: false, toolId, startedAt, completedAt: Date.now(), error: `Tool '${toolId}' is not registered`, validation: 'FAILED' };
    }

    const capability = this.capabilities.authorize(tool.id, {
      taskId: context.taskId,
      mode: context.mode,
      projectId: context.projectId,
      requestedBy: context.requestedBy,
      toolId: tool.id,
      resourceId: context.resourceId ?? `tool:${tool.id}`,
      path: context.path,
      networkOrigin: context.networkOrigin,
    });
    if (!capability.allowed || !capability.descriptor) {
      const reason = capability.reason ?? 'Capability manifest rejected tool execution';
      this.audit('blocked', 'TOOL_EXECUTION', tool.id, reason, true);
      return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: reason, validation: 'FAILED' };
    }
    const manifest = capability.descriptor;

    const policyCheck = PolicyEngine.validateInstruction(`${tool.id} ${JSON.stringify(input)}`);
    if (!policyCheck.allowed) {
      this.audit('blocked', 'TOOL_EXECUTION', tool.id, policyCheck.reason ?? 'Tool request rejected by policy', true);
      return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: policyCheck.reason ?? 'Policy rejected tool request', validation: 'FAILED' };
    }

    if (!tool.validateInput(input)) {
      this.audit('blocked', 'TOOL_VALIDATION', tool.id, 'Input validation failed', true);
      return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: 'Tool input validation failed', validation: 'FAILED' };
    }

    const risk = RiskAnalyzer.assessTool(tool);
    if (!risk.permissionSufficient) {
      this.audit('blocked', 'TOOL_EXECUTION', tool.id, `Declared permission ${risk.declaredPermission} is below required ${risk.requiredPermission}`, true);
      return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: 'Tool permission declaration is insufficient for its risk level', validation: 'FAILED' };
    }

    if (taskRuntime.isCancelled(context.taskId)) {
      return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: 'Task cancelled before tool execution', validation: 'FAILED' };
    }

    const preflight = resourceGovernor.authorize(context.taskId, 'TOOL_CALL', context.mode);
    if (!preflight.allowed) {
      this.audit('blocked', 'TOOL_EXECUTION', tool.id, preflight.reason ?? 'Resource budget blocked tool execution', true);
      return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: preflight.reason ?? 'Resource budget blocked tool execution', validation: 'FAILED' };
    }
    if (manifest.networkAccess) {
      const networkPreflight = resourceGovernor.authorize(context.taskId, 'NETWORK_CALL', context.mode);
      if (!networkPreflight.allowed) {
        this.audit('blocked', 'TOOL_EXECUTION', tool.id, networkPreflight.reason ?? 'Resource budget blocked network access', true);
        return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: networkPreflight.reason ?? 'Resource budget blocked network access', validation: 'FAILED' };
      }
    }

    const permissionGated = manifest.permissionLevel === 'L4_EXECUTE' || manifest.permissionLevel === 'L5_DESTRUCTIVE';
    if (permissionGated) {
      eventBus.emit('CORE_STATE_CHANGE', 'WAITING_PERMISSION');
      taskRuntime.waitForPermission(context.taskId);
    }

    const target = context.projectId ?? 'Current Workspace';
    const requiredScope = {
      taskId: context.taskId,
      projectId: context.projectId,
      action: `TOOL:${tool.id}`,
      target,
      toolId: tool.id,
      resourceId: context.resourceId,
      path: context.path,
      networkOrigin: context.networkOrigin,
      networkAllowed: manifest.networkAccess,
    };
    const grant = await PermissionEngine.requestScopedPermission({
      action: requiredScope.action,
      target,
      level: manifest.permissionLevel,
      changes: [`Execute capability ${tool.id}`],
      risks: [`Manifest risk level: ${manifest.riskLevel}`, ...(manifest.networkAccess ? ['Capability may access network resources'] : [])],
      expectedResult: manifest.description,
      taskId: context.taskId,
      projectId: context.projectId,
      toolId: tool.id,
      resourceId: context.resourceId,
      path: context.path,
      networkAccess: manifest.networkAccess,
      networkOrigin: context.networkOrigin,
      ttlMs: Math.max(15_000, Math.min(manifest.timeoutMs + 10_000, 120_000)),
      maxUses: 1,
    });

    if (!grant || !PermissionEngine.validateGrant(grant.id, requiredScope)) {
      this.audit('warning', 'PERMISSION', tool.id, 'Tool execution rejected by scoped permission gate', true);
      eventBus.emit('CORE_STATE_CHANGE', 'WARNING');
      return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: 'Permission denied or scope mismatch', validation: 'FAILED' };
    }

    if (taskRuntime.isCancelled(context.taskId)) {
      PermissionEngine.revokeGrant(grant.id, 'Task cancelled before tool execution');
      return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: 'Task cancelled before tool execution', validation: 'FAILED' };
    }

    const resourceDecision = resourceGovernor.consumeToolCall(context.taskId, manifest.networkAccess, context.mode);
    if (!resourceDecision.allowed) {
      PermissionEngine.revokeGrant(grant.id, 'Resource budget blocked tool execution');
      this.audit('blocked', 'TOOL_EXECUTION', tool.id, resourceDecision.reason ?? 'Resource budget blocked tool execution', true);
      eventBus.emit('CORE_STATE_CHANGE', 'WARNING');
      return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: resourceDecision.reason ?? 'Resource budget blocked tool execution', validation: 'FAILED' };
    }

    taskRuntime.start(context.taskId);
    const abortController = new AbortController();
    const unregisterCancellation = taskRuntime.registerCancellationHandler(context.taskId, () => abortController.abort());
    const executionContext: ToolExecutionContext = { ...context, signal: abortController.signal };

    try {
      eventBus.emit('CORE_STATE_CHANGE', 'EXECUTING');
      const output = await Sandbox.executeGuarded(
        tool.id,
        async () => {
          const consumed = PermissionEngine.consumeGrant(grant.id, requiredScope);
          if (!consumed) throw new Error('Scoped authorization expired, was revoked, or no longer matches execution scope');
          const runtimeCapability = this.capabilities.authorize(tool.id, {
            taskId: context.taskId,
            mode: context.mode,
            projectId: context.projectId,
            requestedBy: context.requestedBy,
            toolId: tool.id,
            resourceId: context.resourceId ?? `tool:${tool.id}`,
            path: context.path,
            networkOrigin: context.networkOrigin,
          });
          if (!runtimeCapability.allowed) throw new Error(runtimeCapability.reason ?? 'Capability became unavailable before execution');
          if (abortController.signal.aborted) throw new Error('Tool execution cancelled');
          const result = await tool.execute(input, executionContext) as T;
          if (abortController.signal.aborted) throw new Error('Tool execution cancelled');
          return result;
        },
        manifest.timeoutMs
      );

      const outputValid = tool.validateOutput ? tool.validateOutput(output) : true;
      if (!outputValid) {
        taskRuntime.bindStepResult(context.taskId, 'execute', { kind: 'TOOL', operationId: tool.id, outcome: 'FAILED', validationStatus: 'FAILED' });
        this.audit('error', 'TOOL_VALIDATION', tool.id, 'Tool output failed validation', true);
        eventBus.emit('CORE_STATE_CHANGE', 'ERROR');
        return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: 'Tool output validation failed', validation: 'FAILED' };
      }

      const validation = tool.validateOutput ? 'PASSED' : 'NOT_REQUIRED';
      taskRuntime.bindStepResult(context.taskId, 'execute', { kind: 'TOOL', operationId: tool.id, outcome: 'SUCCESS', validationStatus: validation });
      this.audit('info', 'TOOL_EXECUTION', tool.id, `Capability executed successfully for task ${context.taskId} under bounded grant ${grant.id}`, false);
      return { success: true, toolId: tool.id, startedAt, completedAt: Date.now(), data: output, validation };
    } catch (error) {
      const message = abortController.signal.aborted ? 'Tool execution cancelled' : error instanceof Error ? error.message : String(error);
      taskRuntime.bindStepResult(context.taskId, 'execute', { kind: 'TOOL', operationId: tool.id, outcome: abortController.signal.aborted ? 'CANCELLED' : 'FAILED', validationStatus: 'FAILED' });
      this.audit(abortController.signal.aborted ? 'warning' : 'error', 'TOOL_EXECUTION', tool.id, message, true);
      eventBus.emit('CORE_STATE_CHANGE', abortController.signal.aborted ? 'WARNING' : 'ERROR');
      return { success: false, toolId: tool.id, startedAt, completedAt: Date.now(), error: message, validation: 'FAILED' };
    } finally {
      unregisterCancellation();
    }
  }

  private audit(level: SecurityEvent['level'], category: SecurityEvent['category'], action: string, details: string, blocked: boolean) {
    const event: SecurityEvent = {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level,
      category,
      action,
      details,
      blocked,
    };
    eventBus.emit('SECURITY_EVENT', event);
  }
}
