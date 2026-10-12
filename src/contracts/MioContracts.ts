// MIO-PRV-01: core runtime contracts (schema version 1).
// UI-independent shapes shared by the orchestrator, router, capabilities, memory, evidence,
// creative and voice subsystems. Existing domain types are reused rather than redefined.
import type { EpistemicStatus } from '../agents/AntiHallucination';
import type { MioSystemMode } from '../types/core';
import type { AssetOrigin, AssetType } from '../types/project';
import type { PermissionLevel } from '../types/security';
import type { ToolRiskLevel } from '../types/tools';

export const MIO_CONTRACT_SCHEMA_VERSION = 1 as const;
export type MioContractSchemaVersion = typeof MIO_CONTRACT_SCHEMA_VERSION;

// Runtime enum lists. The exhaustiveness checks below fail to compile if a source union gains a
// member that is missing here, so validators can never silently drift from the domain types.
export const MIO_SYSTEM_MODES = ['CHAT', 'RESEARCH', 'FILES', 'MOTION', '3D', 'ANIMATION', 'GRAPHIC', 'DRAWING', 'PHOTO', 'MOTION_2D', 'SFX', 'MUSIC', 'PROJECT', 'TASKS', 'SETTINGS', 'SECURITY'] as const satisfies readonly MioSystemMode[];
export const MIO_PERMISSION_LEVELS = ['L0_OBSERVE', 'L1_SUGGEST', 'L2_CREATE', 'L3_MODIFY', 'L4_EXECUTE', 'L5_DESTRUCTIVE'] as const satisfies readonly PermissionLevel[];
export const MIO_RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const satisfies readonly ToolRiskLevel[];
export const MIO_EPISTEMIC_STATUSES = ['VERIFIED', 'CORROBORATED', 'UNVERIFIED', 'INFERENCE', 'UNKNOWN'] as const satisfies readonly EpistemicStatus[];
export const MIO_ASSET_TYPES = ['3d', 'animation', 'graphic', 'drawing', 'photo', 'motion-2d', 'sfx', 'music', 'document', 'reference'] as const satisfies readonly AssetType[];
export const MIO_ASSET_ORIGINS = ['GENERATED', 'VERIFIED', 'USER-EDITED', 'IMPORTED', 'AI-SUGGESTED'] as const satisfies readonly AssetOrigin[];
type Exhaustive<Union, Listed> = [Exclude<Union, Listed>] extends [never] ? true : never;
const exhaustive: [
  Exhaustive<MioSystemMode, (typeof MIO_SYSTEM_MODES)[number]>,
  Exhaustive<PermissionLevel, (typeof MIO_PERMISSION_LEVELS)[number]>,
  Exhaustive<ToolRiskLevel, (typeof MIO_RISK_LEVELS)[number]>,
  Exhaustive<EpistemicStatus, (typeof MIO_EPISTEMIC_STATUSES)[number]>,
  Exhaustive<AssetType, (typeof MIO_ASSET_TYPES)[number]>,
  Exhaustive<AssetOrigin, (typeof MIO_ASSET_ORIGINS)[number]>,
] = [true, true, true, true, true, true];
void exhaustive;

export const MIO_PRIVACY_CLASSES = ['LOCAL_ONLY', 'REMOTE_ALLOWED'] as const;
export type MioPrivacyClass = (typeof MIO_PRIVACY_CLASSES)[number];

/** Who and where a request runs for. Carries no secrets and no live handles (signals are passed separately). */
export interface MioContext {
  taskId: string;
  traceId: string;
  mode: MioSystemMode;
  requestedBy: 'USER' | 'AGENT';
  privacy: MioPrivacyClass;
  projectId?: string;
  locale?: string;
}

/** The permission a request needs; the PermissionEngine decides whether a grant covers it. */
export interface MioPermission {
  level: PermissionLevel;
  action: string;
  target: string;
  networkOrigin?: string;
  path?: string;
  resourceId?: string;
  grantId?: string;
}

export interface MioBudget {
  maxDurationMs: number;
  maxCostUsd: number;
}

export interface MioCapabilityRequest<I = unknown> {
  schemaVersion: MioContractSchemaVersion;
  requestId: string;
  capabilityId: string;
  input: I;
  context: MioContext;
  permission: MioPermission;
  budget?: MioBudget;
  /** Same key ⇒ same logical operation; lets recovery detect an already-applied mutation. */
  idempotencyKey?: string;
  createdAt: number;
}

// TASK_STATE, CREATIVE_DOCUMENT and PERMISSION_STATE were added additively for the context engine (PRV-03).
export const MIO_EVIDENCE_KINDS = ['RESEARCH_SOURCE', 'PROJECT_KNOWLEDGE', 'FILE', 'MEMORY', 'MODEL_OUTPUT', 'TOOL_OUTPUT', 'TASK_STATE', 'CREATIVE_DOCUMENT', 'PERMISSION_STATE'] as const;
export type MioEvidenceKind = (typeof MIO_EVIDENCE_KINDS)[number];
/** UNTRUSTED evidence is data only and can never grant authority or carry instructions. */
export type MioEvidenceTrust = 'TRUSTED' | 'UNTRUSTED';

export interface MioEvidence {
  id: string;
  kind: MioEvidenceKind;
  label: string;
  status: EpistemicStatus;
  trust: MioEvidenceTrust;
  sourceUri?: string;
  excerpt?: string;
  retrievedAt: number;
}

export interface MioArtifact {
  id: string;
  kind: AssetType;
  name: string;
  origin: AssetOrigin;
  createdAt: number;
  projectId?: string;
  uri?: string;
  mimeType?: string;
  contentHash?: string;
  producedBy?: { capabilityId: string; requestId: string };
}

export const MIO_RUNTIME_ERROR_CODES = ['VALIDATION_FAILED', 'PERMISSION_DENIED', 'CAPABILITY_UNAVAILABLE', 'BUDGET_EXCEEDED', 'TIMEOUT', 'CANCELLED', 'PROVIDER_FAILED', 'POLICY_BLOCKED', 'INTERNAL'] as const;
export type MioRuntimeErrorCode = (typeof MIO_RUNTIME_ERROR_CODES)[number];
/**
 * Whether the failed operation changed state. UNKNOWN means it may have; recovery must not
 * retry such an operation automatically (MIO-PRV-10).
 */
export type MioMutationState = 'NONE' | 'COMMITTED' | 'UNKNOWN';

export interface MioRuntimeError {
  code: MioRuntimeErrorCode;
  message: string;
  retryable: boolean;
  mutationState: MioMutationState;
  capabilityId?: string;
  detail?: string;
}

export const MIO_TRACE_SPAN_KINDS = ['MODEL_CALL', 'TOOL_CALL', 'CAPABILITY_CALL', 'PERMISSION_DECISION', 'VALIDATION', 'CHECKPOINT', 'RETRY', 'RECOVERY'] as const;
export type MioTraceSpanKind = (typeof MIO_TRACE_SPAN_KINDS)[number];
export type MioTraceStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'BLOCKED';

export interface MioUsage {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
}

export interface MioTraceSpan {
  id: string;
  kind: MioTraceSpanKind;
  name: string;
  startedAt: number;
  finishedAt?: number;
  status: MioTraceStatus;
  parentId?: string;
  locality?: 'LOCAL' | 'REMOTE';
  usage?: MioUsage;
  detail?: string;
}

export interface MioExecutionTrace {
  schemaVersion: MioContractSchemaVersion;
  traceId: string;
  requestId: string;
  capabilityId: string;
  taskId: string;
  status: MioTraceStatus;
  startedAt: number;
  finishedAt?: number;
  spans: MioTraceSpan[];
}

interface MioCapabilityResultBase {
  schemaVersion: MioContractSchemaVersion;
  requestId: string;
  capabilityId: string;
  evidence: MioEvidence[];
  artifacts: MioArtifact[];
  trace: MioExecutionTrace;
}
export interface MioCapabilitySuccess<O = unknown> extends MioCapabilityResultBase {
  status: 'SUCCEEDED';
  output: O;
  validation: 'PASSED' | 'NOT_REQUIRED';
}
export interface MioCapabilityFailure extends MioCapabilityResultBase {
  status: 'FAILED' | 'DENIED' | 'CANCELLED';
  error: MioRuntimeError;
}
export type MioCapabilityResult<O = unknown> = MioCapabilitySuccess<O> | MioCapabilityFailure;
