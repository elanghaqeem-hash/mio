// MIO-PRV-01.03: adapters from existing subsystem types to the core contracts.
// Pure functions with no behavior change in the source subsystems.
import type { AIProvenanceReceipt } from '../ai-orchestration/AIProvenance';
import type { ApplicationContextSource } from '../types/models';
import type { ProjectAsset } from '../types/project';
import type { ResearchSource } from '../types/research';
import type { AuthorizationScope, PermissionLevel } from '../types/security';
import type { ToolResult } from '../types/tools';
import {
  MIO_CONTRACT_SCHEMA_VERSION, type MioArtifact, type MioCapabilityRequest, type MioCapabilityResult, type MioEvidence,
  type MioExecutionTrace, type MioMutationState, type MioPermission, type MioTraceSpan,
} from './MioContracts';
import { MIO_CONTRACT_LIMITS } from './MioContractValidation';

const clip = (value: string, max: number): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const MUTATING_LEVELS: ReadonlySet<PermissionLevel> = new Set(['L3_MODIFY', 'L4_EXECUTE', 'L5_DESTRUCTIVE']);

export function permissionFromAuthorizationScope(scope: AuthorizationScope, level: PermissionLevel, grantId?: string): MioPermission {
  return {
    level,
    action: scope.action,
    target: scope.target,
    ...(scope.networkOrigin ? { networkOrigin: scope.networkOrigin } : {}),
    ...(scope.path ? { path: scope.path } : {}),
    ...(scope.resourceId ? { resourceId: scope.resourceId } : {}),
    ...(grantId ? { grantId } : {}),
  };
}

/** External research is always UNTRUSTED: a verified source is accurate data, never authority. */
export function evidenceFromResearchSource(source: ResearchSource, retrievedAt: number): MioEvidence {
  return {
    id: source.id,
    kind: 'RESEARCH_SOURCE',
    label: clip(source.title || source.citationLabel || source.url, MIO_CONTRACT_LIMITS.shortText),
    status: source.status,
    trust: 'UNTRUSTED',
    sourceUri: clip(source.url, MIO_CONTRACT_LIMITS.longText),
    excerpt: clip(source.sanitizedExcerpt, MIO_CONTRACT_LIMITS.longText),
    retrievedAt,
  };
}

/** Project knowledge is trusted only when governance has marked it VERIFIED. */
export function evidenceFromContextSource(source: ApplicationContextSource, retrievedAt: number): MioEvidence {
  const verified = source.trust === 'VERIFIED';
  return {
    id: source.id,
    kind: 'PROJECT_KNOWLEDGE',
    label: clip(source.label, MIO_CONTRACT_LIMITS.shortText),
    status: verified ? 'VERIFIED' : 'UNVERIFIED',
    trust: verified ? 'TRUSTED' : 'UNTRUSTED',
    sourceUri: clip(source.sourceUri, MIO_CONTRACT_LIMITS.longText),
    excerpt: clip(source.text, MIO_CONTRACT_LIMITS.longText),
    retrievedAt: source.reviewedAt ?? retrievedAt,
  };
}

export function artifactFromProjectAsset(asset: ProjectAsset, projectId?: string, producedBy?: MioArtifact['producedBy']): MioArtifact {
  return {
    id: asset.id,
    kind: asset.type,
    name: clip(asset.name, MIO_CONTRACT_LIMITS.shortText),
    origin: asset.origin,
    createdAt: asset.createdAt,
    ...(projectId ? { projectId } : {}),
    ...(asset.filePath ? { uri: clip(asset.filePath, MIO_CONTRACT_LIMITS.longText) } : {}),
    ...(producedBy ? { producedBy } : {}),
  };
}

export function traceSpanFromAIProvenance(receipt: AIProvenanceReceipt, parentId?: string): MioTraceSpan {
  return {
    id: receipt.id,
    kind: 'MODEL_CALL',
    name: `${receipt.providerId}/${receipt.modelId}`,
    startedAt: receipt.startedAt,
    finishedAt: receipt.finishedAt,
    status: receipt.status,
    locality: receipt.locality,
    usage: { estimatedCostUsd: receipt.estimatedCostUsd, ...(receipt.actualCostUsd !== undefined ? { actualCostUsd: receipt.actualCostUsd } : {}) },
    ...(parentId ? { parentId } : {}),
    ...(receipt.cacheHit ? { detail: 'cache hit' } : {}),
  };
}

/**
 * Wraps a legacy ToolResult as a capability result for the request that invoked it. A failed tool that
 * needed L3_MODIFY or higher may have changed state before failing, so its outcome is UNKNOWN and it is
 * never marked retryable.
 */
export function capabilityResultFromToolResult<O>(request: MioCapabilityRequest, result: ToolResult<O>): MioCapabilityResult<O> {
  const status = result.success ? 'SUCCEEDED' : 'FAILED';
  const trace: MioExecutionTrace = {
    schemaVersion: MIO_CONTRACT_SCHEMA_VERSION,
    traceId: request.context.traceId,
    requestId: request.requestId,
    capabilityId: request.capabilityId,
    taskId: request.context.taskId,
    status,
    startedAt: result.startedAt,
    finishedAt: Math.max(result.startedAt, result.completedAt),
    spans: [{ id: `${request.requestId}:tool`, kind: 'TOOL_CALL', name: result.toolId, startedAt: result.startedAt, finishedAt: Math.max(result.startedAt, result.completedAt), status }],
  };
  const base = { schemaVersion: MIO_CONTRACT_SCHEMA_VERSION, requestId: request.requestId, capabilityId: request.capabilityId, evidence: [], artifacts: [], trace };
  if (result.success) {
    return { ...base, status: 'SUCCEEDED', output: result.data as O, validation: result.validation === 'PASSED' ? 'PASSED' : 'NOT_REQUIRED' };
  }
  const mutationState: MioMutationState = MUTATING_LEVELS.has(request.permission.level) ? 'UNKNOWN' : 'NONE';
  return {
    ...base,
    status: 'FAILED',
    error: {
      code: result.validation === 'FAILED' ? 'VALIDATION_FAILED' : 'INTERNAL',
      message: clip(result.error?.trim() || `Tool ${result.toolId} failed`, MIO_CONTRACT_LIMITS.longText),
      retryable: mutationState === 'NONE',
      mutationState,
      capabilityId: request.capabilityId,
    },
  };
}
