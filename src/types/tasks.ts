import type { MioSystemMode } from './core';

export type TaskRuntimeStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING_PERMISSION'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type TaskStepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'CANCELLED';

export interface TaskStepResultBinding {
  kind: 'CONTROL' | 'TOOL' | 'MODEL' | 'VALIDATION';
  operationId: string;
  outcome: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'CANCELLED';
  validationStatus?: string;
  recordedAt: number;
}

export interface RuntimeTaskStep {
  id: string;
  label: string;
  mode: MioSystemMode;
  requiresPermission: boolean;
  status: TaskStepStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  resultBinding?: TaskStepResultBinding;
}

export interface RuntimeTask {
  id: string;
  title: string;
  prompt: string;
  mode: MioSystemMode;
  projectId?: string;
  status: TaskRuntimeStatus;
  progress: number;
  steps: RuntimeTaskStep[];
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  cancellationReason?: string;
  retryCount: number;
  maxRetries: number;
  dependencies: string[];
}

export interface TaskRuntimeSnapshot {
  tasks: RuntimeTask[];
  activeTaskIds: string[];
  updatedAt: number;
}

export interface TaskRuntimeEvent {
  taskId: string;
  type:
    | 'CREATED'
    | 'STARTED'
    | 'WAITING_PERMISSION'
    | 'PAUSED'
    | 'RESUMED'
    | 'STEP_STARTED'
    | 'STEP_RESULT_BOUND'
    | 'STEP_COMPLETED'
    | 'STEP_BLOCKED'
    | 'COMPLETION_BLOCKED'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'RETRY_SCHEDULED';
  timestamp: number;
  details?: string;
}
