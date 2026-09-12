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

export type ExecutionLedgerCategory = 'TASK' | 'RESOURCE' | 'SCHEDULER' | 'SECURITY';
export type ExecutionLedgerOutcome = 'INFO' | 'ALLOWED' | 'BLOCKED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface ExecutionLedgerEntry {
  id: string;
  timestamp: number;
  taskId?: string;
  category: ExecutionLedgerCategory;
  action: string;
  outcome: ExecutionLedgerOutcome;
  details?: string;
}

export interface ExecutionLedgerSnapshot {
  entries: ExecutionLedgerEntry[];
  updatedAt: number;
}
