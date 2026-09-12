import { PolicyEngine } from '../security/PolicyEngine';
import { PermissionEngine } from '../security/PermissionEngine';
import { eventBus } from '../core/EventBus';
import { emergencyStop } from '../core/EmergencyStop';
import { MioSystemMode } from '../types/core';
import { IntentAnalyzer } from '../intelligence/IntentAnalyzer';
import { TaskPlanner } from '../orchestrator/TaskPlanner';

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
}

export class AgentOrchestrator {
  /**
   * Web Lab TP 0.1 operating loop.
   *
   * PERCEIVE -> UNDERSTAND -> PLAN -> ASSESS RISK -> CHECK PERMISSION
   * -> EXECUTE -> VERIFY -> REPORT
   *
   * Intent analysis and task planning are deliberately extracted so the same
   * modules can later be reused by the Electron desktop runtime.
   */
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

    // 1. Central policy / prompt-injection check.
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

    // 2. Lightweight emotional-context signal retained from the existing prototype.
    let emotionalContext: string | undefined;
    const lower = prompt.toLowerCase();
    if (/stressed|overwhelmed|worried|anxious|tired|frustrated/i.test(lower)) {
      emotionalContext = 'Detected user stress/frustration. Responding with calm, structured clarity.';
      eventBus.emit('CORE_STATE_CHANGE', 'EMOTIONAL SUPPORT');
    }

    // 3. Intelligence layer: platform-independent intent analysis.
    const intent = IntentAnalyzer.analyze(prompt);

    // 4. Orchestration layer: create an inspectable task plan.
    const taskPlan = TaskPlanner.create(intent);
    const suggestedMode = taskPlan.primaryMode;

    eventBus.emit('ACTIVITY_LOG', {
      timestamp: Date.now(),
      message: `Task ${taskPlan.id} planned for ${suggestedMode} mode`,
      mode: suggestedMode,
    });

    // 5. Security gate for sensitive operations.
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

    // 6. TP 0.1 synthesis. Real provider execution is introduced behind ModelRouter later.
    eventBus.emit('CORE_STATE_CHANGE', 'PROCESSING');
    await new Promise((resolve) => setTimeout(resolve, 350));

    let resultText: string;
    if (suggestedMode === 'CHAT') {
      resultText = 'I have analyzed the request and prepared a structured response path. MIO Web Lab is currently validating the reusable intelligence and orchestration pipeline before deeper provider integration.';
    } else {
      resultText = `Task routed to [${suggestedMode}] through the reusable MIO intelligence and orchestration layers. Execution remains constrained by project, permission, and validation boundaries.`;
    }

    eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
    setTimeout(() => {
      if (!emergencyStop.isEmergencyStopped()) {
        eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
      }
    }, 1200);

    return {
      understanding: `Analyzed directive: "${intent.normalizedInput}"`,
      plan: taskPlan.steps.map((step) => step.label),
      permissionStatus: intent.sensitive ? 'AUTHORIZED_BY_USER' : 'AUTHORIZED',
      executionSummary: `Processed TP 0.1 workflow in ${suggestedMode} mode.`,
      validationStatus: 'VALIDATED_FOR_TECH_PREVIEW',
      resultText,
      nextSteps: [
        `Continue in ${suggestedMode} workspace`,
        'Persist project context once the Web Lab storage adapter is enabled',
      ],
      suggestedMode,
      emotionalContext,
    };
  }
}
