export type PermissionLevel =
  | 'L0_OBSERVE'
  | 'L1_SUGGEST'
  | 'L2_CREATE'
  | 'L3_MODIFY'
  | 'L4_EXECUTE'
  | 'L5_DESTRUCTIVE';

export interface AuthorizationScope {
  taskId: string;
  projectId?: string;
  action: string;
  target: string;
  toolId?: string;
  networkAllowed?: boolean;
}

export interface AuthorizationGrant {
  id: string;
  level: PermissionLevel;
  scope: AuthorizationScope;
  grantedAt: number;
  expiresAt: number;
  revoked: boolean;
  source: 'AUTO_POLICY' | 'USER_APPROVAL';
}

export interface ScopedPermissionRequest {
  action: string;
  target: string;
  level: PermissionLevel;
  changes: string[];
  risks: string[];
  expectedResult: string;
  taskId?: string;
  projectId?: string;
  toolId?: string;
  networkAccess?: boolean;
  ttlMs?: number;
}

export interface DryRunRequest {
  id: string;
  proposedAction: string;
  target: string;
  changes: string[];
  risks: string[];
  expectedResult: string;
  permissionLevel: PermissionLevel;
  taskId?: string;
  projectId?: string;
  toolId?: string;
  expiresInMs?: number;
  onApprove: () => void;
  onReview: () => void;
  onCancel: () => void;
}

export interface SecurityEvent {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'blocked' | 'error';
  category:
    | 'PERMISSION'
    | 'PROMPT_INJECTION'
    | 'FILE_INTEGRITY'
    | 'UNTRUSTED_CONTENT'
    | 'RESOURCE_LIMIT'
    | 'TOOL_EXECUTION'
    | 'TOOL_VALIDATION';
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
