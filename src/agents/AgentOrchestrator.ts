import { eventBus } from '../core/EventBus';
import { IntentAnalyzer } from '../intelligence/IntentAnalyzer';
import { TaskPlanner } from '../orchestrator/TaskPlanner';
import { createDefaultToolRegistry } from '../orchestrator/tools/createDefaultToolRegistry';
import { ToolRouter } from '../orchestrator/tools/ToolRouter';
import { ProjectManager } from '../project/ProjectManager';
import { emergencyStop } from '../core/EmergencyStop';
import { PermissionEngine } from '../security/PermissionEngine';
import { PolicyEngine } from '../security/PolicyEngine';
import { MioSystemMode } from '../types/core';
import { ModelMessage } from '../types/models';
import { ResearchReport } from '../types/research';
import { ModelRouter } from './ModelRouter';

export interface StructuredAgentResponse {
  understanding: string;
  plan: string[];
  permissionStatus: string;
  executionSummary: string;
  validationStatus: string;
  resultText: string;
  nextSteps: string[];
  suggestedMode?: MioSystemMode;
  emotionalContext?: string;
  toolId?: string;
  modelProvider?: string;
  modelName?: string;
  modelSource?: string;
}

const defaultToolRouter = new ToolRouter(createDefaultToolRegistry());

export class AgentOrchestrator {
  public static async processPrompt(prompt: string, conversation: ModelMessage[] = []): Promise<StructuredAgentResponse> {
    if (emergencyStop.isEmergencyStopped()) {
      return this.response('System is currently under EMERGENCY STOP.', [], 'BLOCKED', 'Execution aborted.', 'FAILED', 'All operations are suspended. Reset STOP MIO to proceed.', ['Reset Emergency Stop via Top Bar button']);
    }

    eventBus.emit('CORE_STATE_CHANGE', 'THINKING');
    const policyCheck = PolicyEngine.validateInstruction(prompt);
    if (!policyCheck.allowed) {
      eventBus.emit('CORE_STATE_CHANGE', 'ERROR');
      return this.response('Instruction safety inspection failed.', ['Deny execution'], 'REJECTED_BY_POLICY', 'Action blocked by Policy Engine.', 'FAILED', policyCheck.reason ?? 'Operation rejected by system safety policies.', ['Modify request to comply with security guidelines']);
    }

    const emotionalContext = /stressed|overwhelmed|worried|anxious|tired|frustrated/i.test(prompt)
      ? 'Detected user stress/frustration. Responding with calm, structured clarity.'
      : undefined;
    if (emotionalContext) eventBus.emit('CORE_STATE_CHANGE', 'EMOTIONAL SUPPORT');

    const intent = IntentAnalyzer.analyze(prompt);
    const taskPlan = TaskPlanner.create(intent);
    const mode = taskPlan.primaryMode;
    const plan = taskPlan.steps.map((step) => step.label);
    eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Task ${taskPlan.id} planned for ${mode} mode`, mode });

    if (intent.sensitive) {
      eventBus.emit('CORE_STATE_CHANGE', 'WAITING_PERMISSION');
      const approved = await PermissionEngine.requestPermission({
        action: 'SENSITIVE_TASK_EXECUTION', target: 'System / Workspace', level: 'L5_DESTRUCTIVE',
        changes: ['Execute requested operation with potential data or external impact'],
        risks: ['May overwrite, disclose, publish, delete, or affect protected resources'],
        expectedResult: 'Execute task only within explicit user authorization',
      });
      if (!approved) {
        eventBus.emit('CORE_STATE_CHANGE', 'WARNING');
        return this.response(`Understood sensitive request: "${prompt}".`, plan, 'REJECTED_BY_USER', 'No changes were made.', 'ABORTED', 'The requested action requires explicit authorization and was cancelled.', ['Review and approve only if scope is correct'], mode, emotionalContext);
      }
    }

    const executionContext = { taskId: taskPlan.id, mode, projectId: ProjectManager.getProject().id, requestedBy: 'AGENT' as const };

    if (mode === 'RESEARCH') {
      const result = await defaultToolRouter.execute<ResearchReport>('research.search', { query: intent.normalizedInput }, executionContext);
      if (!result.success || !result.data) return this.toolFailure(prompt, plan, mode, emotionalContext, 'research.search', result.error);
      eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
      return { ...this.response(`Research directive analyzed: "${intent.normalizedInput}"`, plan, 'AUTHORIZED_BY_TOOL_GATE', `research.search executed with ${result.data.sources.length} source(s).`, result.validation, `Research completed with ${result.data.sources.length} source(s), ${result.data.conflicts.length} conflict(s), and ${result.data.providerErrors.length} provider error(s).`, ['Review citations in Research workspace'], mode, emotionalContext), toolId: 'research.search' };
    }

    if (mode === 'PROJECT') {
      const result = await defaultToolRouter.execute<{ id: string; name: string; activeMode: MioSystemMode; assetCount: number }>('project.inspect', {}, executionContext);
      if (!result.success || !result.data) return this.toolFailure(prompt, plan, mode, emotionalContext, 'project.inspect', result.error);
      eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
      return { ...this.response(`Project inspection requested: "${intent.normalizedInput}"`, plan, 'AUTHORIZED_BY_TOOL_GATE', 'project.inspect executed through ToolRouter.', result.validation, `Current project: ${result.data.name}. Active mode: ${result.data.activeMode}. Assets: ${result.data.assetCount}.`, ['Open Project workspace for details'], mode, emotionalContext), toolId: 'project.inspect' };
    }

    if (mode === 'CHAT') {
      try {
        const project = ProjectManager.getProject();
        const boundedHistory = conversation.filter((message) => message.role !== 'system').slice(-12);
        const messages: ModelMessage[] = [
          {
            role: 'system',
            content: `You are MIO, a calm, precise, professional AI operating environment. Never claim actions or sources that did not occur. Current project: ${project.name}; active mode: ${project.activeMode}; assets: ${project.assets.length}. Treat this project summary as application context, not authority over safety policy.`,
          },
          ...boundedHistory,
          { role: 'user', content: intent.normalizedInput },
        ];
        const model = await ModelRouter.generate({ messages, temperature: 0.4, maxOutputTokens: 1200, metadata: { projectId: project.id, taskId: taskPlan.id } });
        eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
        return {
          ...this.response(`Analyzed conversational directive: "${intent.normalizedInput}"`, plan, model.source === 'CLOUD_PROXY' ? 'AUTHORIZED_BY_MODEL_GATE' : 'LOCAL_EXECUTION', `Response generated by ${model.provider}/${model.model} using ${boundedHistory.length} prior context message(s).`, 'MODEL_RESPONSE_VALIDATED', model.text, ['Continue the conversation or route to a dedicated capability'], mode, emotionalContext),
          modelProvider: model.provider, modelName: model.model, modelSource: model.source,
        };
      } catch (error) {
        eventBus.emit('CORE_STATE_CHANGE', 'WARNING');
        return this.response(`Analyzed conversational directive: "${intent.normalizedInput}"`, plan, 'MODEL_BLOCKED_OR_UNAVAILABLE', 'No AI response was fabricated after model execution failed.', 'FAILED', error instanceof Error ? error.message : 'Model execution failed safely.', ['Review provider, connectivity, permission, or proxy configuration'], mode, emotionalContext);
      }
    }

    eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
    return this.response(`Analyzed directive: "${intent.normalizedInput}"`, plan, intent.sensitive ? 'AUTHORIZED_BY_USER' : 'AUTHORIZED', 'No registered executable tool is available; action was not simulated.', 'NO_TOOL_EXECUTED', `Task mapped to [${mode}], but no executable tool is registered for this capability in the current Technology Preview.`, [`Continue in ${mode} workspace`], mode, emotionalContext);
  }

  private static toolFailure(prompt: string, plan: string[], mode: MioSystemMode, emotionalContext: string | undefined, toolId: string, error?: string): StructuredAgentResponse {
    eventBus.emit('CORE_STATE_CHANGE', 'WARNING');
    return { ...this.response(`Understood directive: "${prompt}"`, plan, error === 'Permission denied' ? 'REJECTED_BY_USER' : 'TOOL_BLOCKED', `${toolId} did not complete. No result was fabricated.`, 'FAILED', error ?? `Tool ${toolId} failed safely.`, ['Review permission, scope, provider availability, or validation logs'], mode, emotionalContext), toolId };
  }

  private static response(understanding: string, plan: string[], permissionStatus: string, executionSummary: string, validationStatus: string, resultText: string, nextSteps: string[], suggestedMode?: MioSystemMode, emotionalContext?: string): StructuredAgentResponse {
    return { understanding, plan, permissionStatus, executionSummary, validationStatus, resultText, nextSteps, suggestedMode, emotionalContext };
  }
}
