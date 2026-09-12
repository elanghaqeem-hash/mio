import type { MioSystemMode } from './core';

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
  mode?: MioSystemMode;
  budget: TaskResourceBudget;
  usage: TaskResourceUsage;
  exhausted: boolean;
  exhaustedReason?: string;
}

export type ResourceOperation = 'SCHEDULER_DISPATCH' | 'TOOL_CALL' | 'MODEL_CALL' | 'NETWORK_CALL';
export type ResourceDecision = 'ALLOW' | 'BLOCK';

export interface ResourceUsageEvent {
  taskId: string;
  operation: ResourceOperation;
  decision: ResourceDecision;
  timestamp: number;
  reason?: string;
  state: TaskResourceState;
}
