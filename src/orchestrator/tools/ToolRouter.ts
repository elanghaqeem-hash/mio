import { eventBus } from '../../core/EventBus';
import { PermissionEngine } from '../../security/PermissionEngine';
import { PolicyEngine } from '../../security/PolicyEngine';
import { RiskAnalyzer } from '../../security/RiskAnalyzer';
import { Sandbox } from '../../security/Sandbox';
import { SecurityEvent } from '../../types/security';
import { ToolExecutionContext, ToolResult } from '../../types/tools';
import { ToolRegistry } from './ToolRegistry';

export class ToolRouter {
  constructor(private readonly registry: ToolRegistry) {}

  public async execute<T = unknown>(toolId: string, input: unknown, context: ToolExecutionContext): Promise<ToolResult<T>> {
    const startedAt = Date.now();
    const tool = this.registry.get(toolId);

    if (!tool) {
      this.audit('blocked', 'TOOL_EXECUTION', toolId, `Unknown tool '${toolId}' rejected`, true);
      return {
        success: false,
        toolId,
        startedAt,
        completedAt: Date.now(),
        error: `Tool '${toolId}' is not registered`,
        validation: 'FAILED',
      };
    }

    const policyCheck = PolicyEngine.validateInstruction(`${tool.id} ${JSON.stringify(input)}`);
    if (!policyCheck.allowed) {
      this.audit('blocked', 'TOOL_EXECUTION', tool.id, policyCheck.reason ?? 'Tool request rejected by policy', true);
      return {
        success: false,
        toolId: tool.id,
        startedAt,
        completedAt: Date.now(),
        error: policyCheck.reason ?? 'Policy rejected tool request',
        validation: 'FAILED',
      };
    }

    if (!tool.modes.includes(context.mode)) {
      this.audit('blocked', 'TOOL_EXECUTION', tool.id, `Tool not authorized for mode ${context.mode}`, true);
      return {
        success: false,
        toolId: tool.id,
        startedAt,
        completedAt: Date.now(),
        error: `Tool '${tool.id}' is not available in ${context.mode} mode`,
        validation: 'FAILED',
      };
    }

    if (!tool.validateInput(input)) {
      this.audit('blocked', 'TOOL_VALIDATION', tool.id, 'Input validation failed', true);
      return {
        success: false,
        toolId: tool.id,
        startedAt,
        completedAt: Date.now(),
        error: 'Tool input validation failed',
        validation: 'FAILED',
      };
    }

    const risk = RiskAnalyzer.assessTool(tool);
    if (!risk.permissionSufficient) {
      this.audit('blocked', 'TOOL_EXECUTION', tool.id, `Declared permission ${risk.declaredPermission} is below required ${risk.requiredPermission}`, true);
      return {
        success: false,
        toolId: tool.id,
        startedAt,
        completedAt: Date.now(),
        error: 'Tool permission declaration is insufficient for its risk level',
        validation: 'FAILED',
      };
    }

    const approved = await PermissionEngine.requestPermission({
      action: `TOOL:${tool.id}`,
      target: context.projectId ?? 'Current Workspace',
      level: tool.permissionLevel,
      changes: [`Execute tool ${tool.id}`],
      risks: [`Risk level: ${tool.riskLevel}`],
      expectedResult: tool.description,
    });

    if (!approved) {
      this.audit('warning', 'PERMISSION', tool.id, 'Tool execution rejected by permission gate', true);
      return {
        success: false,
        toolId: tool.id,
        startedAt,
        completedAt: Date.now(),
        error: 'Permission denied',
        validation: 'FAILED',
      };
    }

    try {
      eventBus.emit('CORE_STATE_CHANGE', 'EXECUTING');
      const output = await Sandbox.executeGuarded(
        tool.id,
        () => tool.execute(input, context) as Promise<T>,
        tool.timeoutMs
      );

      const outputValid = tool.validateOutput ? tool.validateOutput(output) : true;
      if (!outputValid) {
        this.audit('error', 'TOOL_VALIDATION', tool.id, 'Tool output failed validation', true);
        return {
          success: false,
          toolId: tool.id,
          startedAt,
          completedAt: Date.now(),
          error: 'Tool output validation failed',
          validation: 'FAILED',
        };
      }

      this.audit('info', 'TOOL_EXECUTION', tool.id, `Tool executed successfully for task ${context.taskId}`, false);
      return {
        success: true,
        toolId: tool.id,
        startedAt,
        completedAt: Date.now(),
        data: output,
        validation: tool.validateOutput ? 'PASSED' : 'NOT_REQUIRED',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.audit('error', 'TOOL_EXECUTION', tool.id, message, true);
      return {
        success: false,
        toolId: tool.id,
        startedAt,
        completedAt: Date.now(),
        error: message,
        validation: 'FAILED',
      };
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
