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
  networkOrigin?: string;
  resourceId?: string;
  path?: string;
  networkAllowed?: boolean;
}

export interface AuthorizationGrant {
  id: string;
  level: PermissionLevel;
  scope: AuthorizationScope;
  grantedAt: number;
  expiresAt: number;
  revoked: boolean;
  revokeReason?: string;
  source: 'AUTO_POLICY' | 'USER_APPROVAL';
  maxUses: number;
  uses: number;
  requiresDryRun: boolean;
  reusableAcrossTasks?: boolean;
  idleTtlMs?: number;
  absoluteExpiresAt?: number;
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
  networkOrigin?: string;
  resourceId?: string;
  path?: string;
  ttlMs?: number;
  maxUses?: number;
  forceDryRun?: boolean;
  allowSessionGrant?: boolean;
  sessionMaxUses?: number;
  sessionIdleTtlMs?: number;
  sessionAbsoluteTtlMs?: number;
  reusableAcrossTasks?: boolean;
  absoluteTtlMs?: number;
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
  scopeSummary?: string[];
  expiresInMs?: number;
  maxUses?: number;
  sessionMaxUses?: number;
  sessionIdleTtlMs?: number;
  sessionAbsoluteTtlMs?: number;
  onApprove: () => void;
  onApproveSession?: () => void;
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
