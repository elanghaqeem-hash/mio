import type { RuntimeTask, RuntimeTaskStep } from '../types/tasks';

export type TaskIntegrityIssueCode =
  | 'TERMINAL_WITH_INCOMPLETE_STEP'
  | 'EXECUTE_COMPLETED_WITHOUT_SUCCESS_BINDING'
  | 'MULTIPLE_RUNNING_STEPS'
  | 'PROGRESS_MISMATCH'
  | 'STEP_TIME_INVERSION'
  | 'TASK_TIME_INVERSION';

export interface TaskIntegrityIssue {
  code: TaskIntegrityIssueCode;
  severity: 'ERROR' | 'WARNING';
  stepId?: string;
  detail: string;
}

export interface TaskIntegrityStepReport {
  stepId: string;
  status: RuntimeTaskStep['status'];
  resultBound: boolean;
  resultOutcome?: string;
  issues: TaskIntegrityIssueCode[];
}

export interface TaskIntegrityReport {
  taskId: string;
  valid: boolean;
  expectedProgress: number;
  actualProgress: number;
  issues: TaskIntegrityIssue[];
  steps: TaskIntegrityStepReport[];
  disclosure: string;
}

function expectedProgress(task: RuntimeTask): number {
  if (task.steps.length === 0) return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status) ? 100 : 0;
  const completed = task.steps.filter((step) => step.status === 'COMPLETED' || step.status === 'SKIPPED').length;
  return Math.round((completed / task.steps.length) * 100);
}

export class TaskIntegrity {
  public static inspect(task: RuntimeTask): TaskIntegrityReport {
    const issues: TaskIntegrityIssue[] = [];
    const perStep = new Map<string, TaskIntegrityIssueCode[]>();
    const add = (issue: TaskIntegrityIssue) => {
      issues.push(issue);
      if (issue.stepId) perStep.set(issue.stepId, [...(perStep.get(issue.stepId) ?? []), issue.code]);
    };

    if (task.completedAt && task.startedAt && task.completedAt < task.startedAt) {
      add({ code: 'TASK_TIME_INVERSION', severity: 'ERROR', detail: 'Task completedAt precedes startedAt.' });
    }

    const runningSteps = task.steps.filter((step) => step.status === 'RUNNING');
    if (runningSteps.length > 1) {
      add({ code: 'MULTIPLE_RUNNING_STEPS', severity: 'ERROR', detail: `Task has ${runningSteps.length} simultaneously RUNNING steps.` });
    }

    for (const step of task.steps) {
      if (step.startedAt && step.completedAt && step.completedAt < step.startedAt) {
        add({ code: 'STEP_TIME_INVERSION', severity: 'ERROR', stepId: step.id, detail: `Step ${step.id} completedAt precedes startedAt.` });
      }
      if (step.id === 'execute' && step.status === 'COMPLETED' && step.resultBinding?.outcome !== 'SUCCESS') {
        add({ code: 'EXECUTE_COMPLETED_WITHOUT_SUCCESS_BINDING', severity: 'ERROR', stepId: step.id, detail: 'Execute step is COMPLETED without a SUCCESS result binding.' });
      }
    }

    if (task.status === 'COMPLETED') {
      for (const step of task.steps) {
        if (step.status !== 'COMPLETED' && step.status !== 'SKIPPED') {
          add({ code: 'TERMINAL_WITH_INCOMPLETE_STEP', severity: 'ERROR', stepId: step.id, detail: `Task is COMPLETED while step ${step.id} is ${step.status}.` });
        }
      }
    }

    const expected = expectedProgress(task);
    if (task.progress !== expected) {
      add({ code: 'PROGRESS_MISMATCH', severity: 'WARNING', detail: `Stored progress ${task.progress}% does not match step-derived progress ${expected}%.` });
    }

    return {
      taskId: task.id,
      valid: issues.every((issue) => issue.severity !== 'ERROR'),
      expectedProgress: expected,
      actualProgress: task.progress,
      issues,
      steps: task.steps.map((step) => ({
        stepId: step.id,
        status: step.status,
        resultBound: Boolean(step.resultBinding),
        resultOutcome: step.resultBinding?.outcome,
        issues: perStep.get(step.id) ?? [],
      })),
      disclosure: 'Task integrity is a deterministic runtime-consistency audit. It verifies recorded state coherence, not correctness of the underlying business result.',
    };
  }
}
