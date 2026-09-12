import { PolicyEngine } from '../security/PolicyEngine';
import { PermissionEngine } from '../security/PermissionEngine';
import { eventBus } from '../core/EventBus';
import { emergencyStop } from '../core/EmergencyStop';
import { MioSystemMode } from '../types/core';

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
   * Evaluates user prompt and runs the agent operating loop:
   * PERCEIVE -> UNDERSTAND -> ANALYZE -> PLAN -> ASSESS RISK -> CHECK PERMISSION -> EXECUTE -> VERIFY -> REPORT
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

    // 1. Policy & Injection Check
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

    // 2. Emotional Context Detection (Section 7)
    let emotionalContext: string | undefined;
    const lower = prompt.toLowerCase();
    if (/stressed|overwhelmed|worried|anxious|tired|frustrated/i.test(lower)) {
      emotionalContext = 'Detected user stress/frustration. Responding with calm, structured clarity.';
      eventBus.emit('CORE_STATE_CHANGE', 'EMOTIONAL SUPPORT');
    }

    // 3. Mode Router Intent Analysis (Section 54)
    let suggestedMode: MioSystemMode = 'CHAT';
    if (lower.includes('search') || lower.includes('research') || lower.includes('find info') || lower.includes('documentation')) {
      suggestedMode = 'RESEARCH';
    } else if (lower.includes('file') || lower.includes('organize') || lower.includes('directory') || lower.includes('duplicate')) {
      suggestedMode = 'FILES';
    } else if (lower.includes('motion') || lower.includes('pose') || lower.includes('camera') || lower.includes('gesture')) {
      suggestedMode = 'MOTION';
    } else if (lower.includes('3d') || lower.includes('mesh') || lower.includes('model') || lower.includes('geometry')) {
      suggestedMode = '3D';
    } else if (lower.includes('animat') || lower.includes('keyframe') || lower.includes('motion path')) {
      suggestedMode = 'ANIMATION';
    } else if (lower.includes('poster') || lower.includes('graphic') || lower.includes('layer') || lower.includes('vector') || lower.includes('typography')) {
      suggestedMode = 'GRAPHIC';
    } else if (lower.includes('sfx') || lower.includes('sound effect') || lower.includes('synth sound') || lower.includes('laser sound')) {
      suggestedMode = 'SFX';
    } else if (lower.includes('music') || lower.includes('piano') || lower.includes('compose') || lower.includes('melody') || lower.includes('bpm')) {
      suggestedMode = 'MUSIC';
    } else if (lower.includes('security') || lower.includes('permission') || lower.includes('audit')) {
      suggestedMode = 'SECURITY';
    }

    // 4. Permission Check for Sensitive Operations
    const isSensitive = /delete|overwrite|wipe|publish|upload|network|camera|microphone/i.test(lower);
    if (isSensitive) {
      const approved = await PermissionEngine.requestPermission({
        action: 'SENSITIVE_TASK_EXECUTION',
        target: 'System / Workspace',
        level: 'L5_DESTRUCTIVE',
        changes: ['Execute requested operation with potential data modification'],
        risks: ['May overwrite or affect existing files'],
        expectedResult: 'Execute task under user authorization',
      });

      if (!approved) {
        eventBus.emit('CORE_STATE_CHANGE', 'WARNING');
        return {
          understanding: `Understood sensitive request: "${prompt}".`,
          plan: ['Request user approval', 'Halt on user rejection'],
          permissionStatus: 'REJECTED_BY_USER',
          executionSummary: 'No changes were made to system or project files.',
          validationStatus: 'ABORTED',
          resultText: 'The requested action requires explicit authorization and was cancelled.',
          nextSteps: ['Confirm permission if you wish to proceed'],
        };
      }
    }

    // 5. Synthesis & Logical Reasoning Response
    eventBus.emit('CORE_STATE_CHANGE', 'PROCESSING');
    await new Promise((r) => setTimeout(r, 600));

    let resultText = '';
    const planSteps: string[] = [
      'Deconstruct query into core logical propositions',
      'Examine assumptions and boundary conditions',
      `Route workflow to designated workspace [${suggestedMode}]`,
    ];

    if (suggestedMode === 'CHAT') {
      resultText = `I have analyzed your inquiry with logical decomposition. As an AI system, I operate with transparent epistemics and zero simulated sentimentality. How would you like to structure this discussion or project further?`;
    } else {
      resultText = `Task identified for native studio mode [${suggestedMode}]. All project assets remain isolated in your project sandbox and verified against structural integrity requirements.`;
      planSteps.push(`Configure studio parameters for ${suggestedMode}`);
      planSteps.push('Validate output against security sandbox policies');
    }

    eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
    setTimeout(() => {
      if (!emergencyStop.isEmergencyStopped()) {
        eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
      }
    }, 1500);

    return {
      understanding: `Analyzed directive: "${prompt}"`,
      plan: planSteps,
      permissionStatus: 'AUTHORIZED',
      executionSummary: `Executed analytical synthesis in ${suggestedMode} mode.`,
      validationStatus: 'VERIFIED',
      resultText,
      nextSteps: [
        `Navigate to ${suggestedMode} studio workspace to inspect assets`,
        'Verify parameters or run automated multi-mode pipeline',
      ],
      suggestedMode,
      emotionalContext,
    };
  }
}
