import { PolicyEngine } from '../security/PolicyEngine';
import { PermissionEngine } from '../security/PermissionEngine';
import { eventBus } from '../core/EventBus';
import { emergencyStop } from '../core/EmergencyStop';
import { MioSystemMode } from '../types/core';
import { IntentAnalyzer } from '../intelligence/IntentAnalyzer';
import { TaskPlanner } from '../orchestrator/TaskPlanner';
import { createDefaultToolRegistry } from '../orchestrator/tools/createDefaultToolRegistry';
import { ToolRouter } from '../orchestrator/tools/ToolRouter';
import { ProjectManager } from '../project/ProjectManager';
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
  public static async processPrompt(prompt: string): Promise<StructuredAgentResponse> {
    if (emergencyStop.isEmergencyStopped()) {
      return {
        understanding: 'System is currently under EMERGENCY STOP.',
        plan: [],
        permissionStatus: 'BLOCKED',
        executionSummary: 'Execution aborted.',
        validationStatus: 'FAILED',
        resultText: 'All operations are suspended. Please reset Emergency Stop to proceed.',
        nextSteps: ['Reset Emergency Stop via Top Bar button'],
      };
    }

    eventBus.emit('CORE_STATE_CHANGE', 'THINKING');
    const policyCheck = PolicyEngine.validateInstruction(prompt);
    if (!policyCheck.allowed) {
      eventBus.emit('CORE_STATE_CHANGE', 'ERROR');
      return {
        understanding: 'Instruction safety inspection failed.',
        plan: ['Deny execution'],
        permissionStatus: 'REJECTED_BY_POLICY',
        executionSummary: 'Action blocked by Policy Engine.',
        validationStatus: 'FAILED',
        resultText: policyCheck.reason || 'Operation rejected by system safety policies.',
        nextSteps: ['Modify request to comply with security guidelines'],
      };
    }

    let emotionalContext: string | undefined;
    const lower = prompt.toLowerCase();
    if (/stressed|overwhelmed|worried|anxious|tired|frustrated/i.test(lower)) {
      emotionalContext = 'Detected user stress/frustration. Responding with calm, structured clarity.';
      eventBus.emit('CORE_STATE_CHANGE', 'EMOTIONAL SUPPORT');
    }

    const intent = IntentAnalyzer.analyze(prompt);
    const taskPlan = TaskPlanner.create(intent);
    const suggestedMode = taskPlan.primaryMode;

    eventBus.emit('ACTIVITY_LOG', {
      timestamp: Date.now(),
      message: `Task ${taskPlan.id} planned for ${suggestedMode} mode`,
      mode: suggestedMode,
    });

    if (intent.sensitive) {
      eventBus.emit('CORE_STATE_CHANGE', 'WAITING_PERMISSION');
      const approved = await PermissionEngine.requestPermission({
        action: 'SENSITIVE_TASK_EXECUTION',
        target: 'System / Workspace',
        level: 'L5_DESTRUCTIVE',
        changes: ['Execute requested operation with potential data or external impact'],
        risks: ['May overwrite, disclose, publish, delete, or affect protected resources'],
        expectedResult: 'Execute task only within explicit user authorization',
      });

      if (!approved) {
        eventBus.emit('CORE_STATE_CHANGE', 'WARNING');
        return {
          understanding: `Understood sensitive request: "${prompt}".`,
          plan: taskPlan.steps.map((step) => step.label),
          permissionStatus: 'REJECTED_BY_USER',
          executionSummary: 'No changes were made to system or project resources.',
          validationStatus: 'ABORTED',
          resultText: 'The requested action requires explicit authorization and was cancelled.',
          nextSteps: ['Review the proposed operation and approve only if the scope is correct'],
          suggestedMode,
          emotionalContext,
        };
      }
    }

    const context = {
      taskId: taskPlan.id,
      mode: suggestedMode,
      projectId: ProjectManager.getProject().id,
      requestedBy: 'AGENT' as const,
    };

    if (suggestedMode === 'RESEARCH') {
      const toolResult = await defaultToolRouter.execute<ResearchReport>('research.search', { query: intent.normalizedInput }, context);
      if (!toolResult.success || !toolResult.data) {
        return this.toolFailureResponse(prompt, taskPlan.steps.map((step) => step.label), suggestedMode, emotionalContext, 'research.search', toolResult.error);
      }

      eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
      return {
        understanding: `Research directive analyzed: "${intent.normalizedInput}"`,
        plan: taskPlan.steps.map((step) => step.label),
        permissionStatus: 'AUTHORIZED_BY_TOOL_GATE',
        executionSummary: `research.search executed through ToolRouter with ${toolResult.data.sources.length} source(s).`,
        validationStatus: toolResult.validation,
        resultText: `Research completed with ${toolResult.data.sources.length} source(s), ${toolResult.data.conflicts.length} detected conflict(s), and ${toolResult.data.providerErrors.length} provider error(s). Open the Research workspace to inspect source-level evidence and citations.`,
        nextSteps: ['Review citations and source reliability in Research workspace', 'Promote any memory candidate only through MemoryPolicy review'],
        suggestedMode,
        emotionalContext,
        toolId: 'research.search',
      };
    }

    if (suggestedMode === 'PROJECT') {
      const toolResult = await defaultToolRouter.execute<{ id: string; name: string; activeMode: MioSystemMode; assetCount: number; lastModified: number }>('project.inspect', {}, context);
      if (!toolResult.success || !toolResult.data) {
        return this.toolFailureResponse(prompt, taskPlan.steps.map((step) => step.label), suggestedMode, emotionalContext, 'project.inspect', toolResult.error);
      }

      eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
      return {
        understanding: `Project inspection requested: "${intent.normalizedInput}"`,
        plan: taskPlan.steps.map((step) => step.label),
        permissionStatus: 'AUTHORIZED_BY_TOOL_GATE',
        executionSummary: 'project.inspect executed through ToolRouter.',
        validationStatus: toolResult.validation,
        resultText: `Current project: ${toolResult.data.name}. Active mode: ${toolResult.data.activeMode}. Assets: ${toolResult.data.assetCount}.`,
        nextSteps: ['Open Project workspace for versions, assets, and activity history'],
        suggestedMode,
        emotionalContext,
        toolId: 'project.inspect',
      };
    }

    if (suggestedMode === 'CHAT') {
      try {
        const modelResponse = await ModelRouter.generate({
          messages: [
            {
              role: 'system',
              content: 'You are MIO, a calm, precise, professional AI operating environment. Never claim actions, sources, files, or tool execution that did not occur. Keep user control and uncertainty explicit.',
            },
            { role: 'user', content: intent.normalizedInput },
          ],
          temperature: 0.4,
          maxOutputTokens: 1200,
          metadata: { projectId: ProjectManager.getProject().id, taskId: taskPlan.id },
        });

        eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
        return {
          understanding: `Analyzed conversational directive: "${intent.normalizedInput}"`,
          plan: taskPlan.steps.map((step) => step.label),
          permissionStatus: modelResponse.source === 'CLOUD_PROXY' ? 'AUTHORIZED_BY_MODEL_GATE' : 'LOCAL_EXECUTION',
          executionSummary: `Response generated by ${modelResponse.provider}/${modelResponse.model}.`,
          validationStatus: 'MODEL_RESPONSE_VALIDATED',
          resultText: modelResponse.text,
          nextSteps: ['Continue the conversation or route the next request to a dedicated MIO capability'],
          suggestedMode,
          emotionalContext,
          modelProvider: modelResponse.provider,
          modelName: modelResponse.model,
          modelSource: modelResponse.source,
        };
      } catch (error) {
        eventBus.emit('CORE_STATE_CHANGE', 'WARNING');
        return {
          understanding: `Analyzed conversational directive: "${intent.normalizedInput}"`,
          plan: taskPlan.steps.map((step) => step.label),
          permissionStatus: 'MODEL_BLOCKED_OR_UNAVAILABLE',
          executionSummary: 'No AI response was fabricated after model execution failed.',
          validationStatus: 'FAILED',
          resultText: error instanceof Error ? error.message : 'Model execution failed safely.',
          nextSteps: ['Review model provider, connectivity, permission, or secure proxy configuration'],
          suggestedMode,
          emotionalContext,
        };
      }
    }

    eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
    return {
      understanding: `Analyzed directive: "${intent.normalizedInput}"`,
      plan: taskPlan.steps.map((step) => step.label),
      permissionStatus: intent.sensitive ? 'AUTHORIZED_BY_USER' : 'AUTHORIZED',
      executionSummary: 'No registered executable tool is available for this mode; action intentionally not simulated.',
      validationStatus: 'NO_TOOL_EXECUTED',
      resultText: `Task mapped to [${suggestedMode}], but no executable tool is registered for this capability in the current Technology Preview. No system action was performed.`,
      nextSteps: [`Continue in ${suggestedMode} workspace`],
      suggestedMode,
      emotionalContext,
    };
  }

  private static toolFailureResponse(
    prompt: string,
    plan: string[],
    mode: MioSystemMode,
    emotionalContext: string | undefined,
    toolId: string,
    error?: string
  ): StructuredAgentResponse {
    eventBus.emit('CORE_STATE_CHANGE', 'WARNING');
    return {
      understanding: `Understood directive: "${prompt}"`,
      plan,
      permissionStatus: error === 'Permission denied' ? 'REJECTED_BY_USER' : 'TOOL_BLOCKED',
      executionSummary: `${toolId} did not complete. No result was fabricated.`,
      validationStatus: 'FAILED',
      resultText: error ?? `Tool ${toolId} failed safely.`,
      nextSteps: ['Review permission, tool scope, provider availability, or validation logs'],
      suggestedMode: mode,
      emotionalContext,
      toolId,
    };
  }
}
