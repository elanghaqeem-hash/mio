import type { PermissionLevel } from '../types/security';

export type PermissionApprovalMode = 'AUTO_SCOPED' | 'USER_DRY_RUN' | 'USER_DESTRUCTIVE_CONFIRMATION';

export interface PermissionLevelPolicy {
  level: PermissionLevel;
  label: string;
  approvalMode: PermissionApprovalMode;
  description: string;
  destructive: boolean;
  maxDefaultUses: number;
  maxTtlMs: number;
}

export const PERMISSION_LEVEL_POLICIES: readonly PermissionLevelPolicy[] = [
  { level: 'L0_OBSERVE', label: 'Observe', approvalMode: 'AUTO_SCOPED', description: 'Read or observe bounded state without changing it.', destructive: false, maxDefaultUses: 2, maxTtlMs: 300_000 },
  { level: 'L1_SUGGEST', label: 'Suggest', approvalMode: 'AUTO_SCOPED', description: 'Produce recommendations or proposed actions without direct mutation.', destructive: false, maxDefaultUses: 2, maxTtlMs: 300_000 },
  { level: 'L2_CREATE', label: 'Create', approvalMode: 'AUTO_SCOPED', description: 'Create bounded project-local artifacts through declared capabilities.', destructive: false, maxDefaultUses: 2, maxTtlMs: 300_000 },
  { level: 'L3_MODIFY', label: 'Modify', approvalMode: 'AUTO_SCOPED', description: 'Modify an explicitly scoped resource; the grant cannot escape its task/resource boundary.', destructive: false, maxDefaultUses: 2, maxTtlMs: 300_000 },
  { level: 'L4_EXECUTE', label: 'Execute', approvalMode: 'USER_DRY_RUN', description: 'Execute an external, networked, or operational action only after explicit dry-run approval.', destructive: false, maxDefaultUses: 2, maxTtlMs: 300_000 },
  { level: 'L5_DESTRUCTIVE', label: 'Destructive', approvalMode: 'USER_DESTRUCTIVE_CONFIRMATION', description: 'Perform high-impact or destructive mutation only after explicit approval; always single-use and short-lived.', destructive: true, maxDefaultUses: 1, maxTtlMs: 30_000 },
] as const;

export function getPermissionLevelPolicy(level: PermissionLevel): PermissionLevelPolicy {
  const policy = PERMISSION_LEVEL_POLICIES.find((item) => item.level === level);
  if (!policy) throw new Error(`Unknown permission level '${level}'`);
  return policy;
}
