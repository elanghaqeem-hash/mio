export interface TaskResourceBudget {
  maxDurationMs: number;
  maxToolCalls: number;
  maxNetworkCalls: number;
  maxModelCalls: number;
}

export interface TaskResourceUsage {
  toolCalls: number;
  networkCalls: number;
  modelCalls: number;
  startedAt: number;
  lastUpdatedAt: number;
}

export interface TaskResourceState {
  taskId: string;
  budget: TaskResourceBudget;
  usage: TaskResourceUsage;
  exhausted: boolean;
  exhaustedReason?: string;
}

export type ResourceOperation = 'SCHEDULER_DISPATCH' | 'TOOL_CALL' | 'MODEL_CALL' | 'NETWORK_CALL';

export interface ResourceUsageEvent {
  taskId: string;
  operation: ResourceOperation;
  timestamp: number;
  state: TaskResourceState;
}
