import type { MioSystemMode } from './core';
import type { PermissionLevel } from './security';
import type { ToolRiskLevel } from './tools';

export type CapabilityKind = 'TOOL' | 'SERVICE' | 'AGENT';
export type CapabilityAvailability = 'AVAILABLE' | 'UNAVAILABLE';
export type CapabilityOwnerLayer = 'ORCHESTRATOR' | 'SECURITY' | 'SERVICE' | 'AGENT' | 'CREATIVE';
export type CapabilityScopeField = 'TASK' | 'PROJECT' | 'TOOL' | 'RESOURCE' | 'PATH' | 'NETWORK_ORIGIN';

export interface CapabilityDescriptor {
  id: string;
  kind: CapabilityKind;
  description: string;
  ownerLayer: CapabilityOwnerLayer;
  modes: MioSystemMode[];
  riskLevel: ToolRiskLevel;
  permissionLevel: PermissionLevel;
  availability: CapabilityAvailability;
  networkAccess: boolean;
  scopeFields: CapabilityScopeField[];
  timeoutMs: number;
}

export interface CapabilityExecutionContext {
  taskId: string;
  mode: MioSystemMode;
  projectId?: string;
  requestedBy: 'USER' | 'AGENT';
  toolId?: string;
  resourceId?: string;
  path?: string;
  networkOrigin?: string;
}

export interface CapabilityDecision {
  allowed: boolean;
  capabilityId: string;
  reason?: string;
  descriptor?: CapabilityDescriptor;
}

export interface CapabilityDecisionEvent extends CapabilityDecision {
  taskId?: string;
  mode?: MioSystemMode;
  timestamp: number;
}

export interface CapabilitySnapshot {
  capabilities: CapabilityDescriptor[];
  updatedAt: number;
}
