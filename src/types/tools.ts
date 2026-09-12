import { MioSystemMode } from './core';
import { PermissionLevel } from './security';

export type ToolRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface ToolExecutionContext {
  taskId: string;
  mode: MioSystemMode;
  projectId?: string;
  requestedBy: 'USER' | 'AGENT';
  signal?: AbortSignal;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  toolId: string;
  startedAt: number;
  completedAt: number;
  data?: T;
  error?: string;
  validation: 'PASSED' | 'FAILED' | 'NOT_REQUIRED';
}

export interface MioTool<I = unknown, O = unknown> {
  id: string;
  description: string;
  modes: MioSystemMode[];
  riskLevel: ToolRiskLevel;
  permissionLevel: PermissionLevel;
  timeoutMs: number;
  validateInput: (input: unknown) => input is I;
  execute: (input: I, context: ToolExecutionContext) => Promise<O>;
  validateOutput?: (output: O) => boolean;
}
