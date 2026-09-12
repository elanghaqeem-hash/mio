import type { TaskResourceState } from './resources';

export type ExecutionHistoryKind = 'TASK' | 'RESOURCE' | 'SECURITY';

export interface ExecutionHistoryRecord {
  id: string;
  taskId?: string;
  timestamp: number;
  kind: ExecutionHistoryKind;
  event: string;
  details?: string;
  resourceState?: TaskResourceState;
}

export interface ExecutionHistorySnapshot {
  records: ExecutionHistoryRecord[];
  updatedAt: number;
}
