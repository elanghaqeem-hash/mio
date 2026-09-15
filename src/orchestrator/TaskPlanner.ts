import type { MioSystemMode } from '../types/core';
import type { IntentAnalysis } from '../intelligence/IntentAnalyzer';

export type TaskPlanStatus = 'DRAFT' | 'READY' | 'WAITING_PERMISSION' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface TaskPlanStep {
  id: string;
  label: string;
  mode: MioSystemMode;
  requiresPermission: boolean;
}

export interface TaskPlan {
  id: string;
  createdAt: number;
  status: TaskPlanStatus;
  primaryMode: MioSystemMode;
  steps: TaskPlanStep[];
}

export class TaskPlanner {
  public static create(intent: IntentAnalysis): TaskPlan {
    const mode = intent.suggestedMode;
    const steps: TaskPlanStep[] = [
      {
        id: 'understand',
        label: 'Confirm request intent and project context',
        mode: 'CHAT',
        requiresPermission: false,
      },
      {
        id: 'route',
        label: `Route task to ${mode} capability`,
        mode,
        requiresPermission: false,
      },
      {
        id: 'execute',
        label: `Execute ${mode} workflow within authorized scope`,
        mode,
        requiresPermission: intent.sensitive,
      },
      {
        id: 'validate',
        label: 'Validate result before presentation or persistence',
        mode,
        requiresPermission: false,
      },
    ];

    return {
      id: `task_${Date.now()}`,
      createdAt: Date.now(),
      status: intent.sensitive ? 'WAITING_PERMISSION' : 'READY',
      primaryMode: mode,
      steps,
    };
  }
}
