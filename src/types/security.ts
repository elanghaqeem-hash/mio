export type PermissionLevel =
  | 'L0_OBSERVE'
  | 'L1_SUGGEST'
  | 'L2_CREATE'
  | 'L3_MODIFY'
  | 'L4_EXECUTE'
  | 'L5_DESTRUCTIVE';

export interface DryRunRequest {
  id: string;
  proposedAction: string;
  target: string;
  changes: string[];
  risks: string[];
  expectedResult: string;
  permissionLevel: PermissionLevel;
  onApprove: () => void;
  onReview: () => void;
  onCancel: () => void;
}

export interface SecurityEvent {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'blocked' | 'error';
  category: 'PERMISSION' | 'PROMPT_INJECTION' | 'FILE_INTEGRITY' | 'UNTRUSTED_CONTENT' | 'RESOURCE_LIMIT';
  action: string;
  details: string;
  blocked: boolean;
}

export interface MemoryItem {
  id: string;
  timestamp: number;
  category: 'FACT' | 'USER_PREF' | 'PROJECT_CONTEXT' | 'INSTRUCTION';
  content: string;
  confidence: number;
  source: string;
  permissionLevel: PermissionLevel;
}
