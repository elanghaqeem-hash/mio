import { PermissionLevel } from '../types/security';
import { MioTool, ToolRiskLevel } from '../types/tools';

const riskPermissionMap: Record<ToolRiskLevel, PermissionLevel> = {
  LOW: 'L1_SUGGEST',
  MODERATE: 'L2_CREATE',
  HIGH: 'L4_EXECUTE',
  CRITICAL: 'L5_DESTRUCTIVE',
};

const permissionOrder: PermissionLevel[] = [
  'L0_OBSERVE',
  'L1_SUGGEST',
  'L2_CREATE',
  'L3_MODIFY',
  'L4_EXECUTE',
  'L5_DESTRUCTIVE',
];

export interface ToolRiskAssessment {
  riskLevel: ToolRiskLevel;
  requiredPermission: PermissionLevel;
  declaredPermission: PermissionLevel;
  permissionSufficient: boolean;
}

export class RiskAnalyzer {
  public static assessTool(tool: MioTool): ToolRiskAssessment {
    const requiredPermission = riskPermissionMap[tool.riskLevel];
    const declaredIndex = permissionOrder.indexOf(tool.permissionLevel);
    const requiredIndex = permissionOrder.indexOf(requiredPermission);

    return {
      riskLevel: tool.riskLevel,
      requiredPermission,
      declaredPermission: tool.permissionLevel,
      permissionSufficient: declaredIndex >= requiredIndex,
    };
  }
}
