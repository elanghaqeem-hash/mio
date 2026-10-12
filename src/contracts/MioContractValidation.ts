// MIO-PRV-01: runtime validation for the core contracts. Hand-written (no schema library),
// fail-closed, bounded, and versioned: an unknown schemaVersion is rejected, never coerced.
import { assertNoSecretFields } from '../security/SecretRedaction';
import {
  MIO_ASSET_ORIGINS, MIO_ASSET_TYPES, MIO_CONTRACT_SCHEMA_VERSION, MIO_EPISTEMIC_STATUSES, MIO_EVIDENCE_KINDS,
  MIO_PERMISSION_LEVELS, MIO_PRIVACY_CLASSES, MIO_RUNTIME_ERROR_CODES, MIO_SYSTEM_MODES, MIO_TRACE_SPAN_KINDS,
  type MioArtifact, type MioCapabilityRequest, type MioCapabilityResult, type MioContext, type MioEvidence,
  type MioExecutionTrace, type MioPermission, type MioRuntimeError,
} from './MioContracts';

export type MioValidation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const MIO_CONTRACT_LIMITS = {
  idLength: 200,
  shortText: 500,
  longText: 4000,
  maxSpans: 1000,
  maxEvidence: 500,
  maxArtifacts: 500,
} as const;

const TRACE_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'BLOCKED'] as const;
const ID = /^\S+$/;

class Checker {
  readonly errors: string[] = [];
  private fail(path: string, message: string): false { this.errors.push(`${path}: ${message}`); return false; }

  object(value: unknown, path: string): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? true : this.fail(path, 'must be an object');
  }
  id(value: unknown, path: string, optional = false): boolean {
    if (value === undefined && optional) return true;
    if (typeof value !== 'string' || !ID.test(value)) return this.fail(path, 'must be a non-empty identifier without whitespace');
    return value.length <= MIO_CONTRACT_LIMITS.idLength || this.fail(path, `must be at most ${MIO_CONTRACT_LIMITS.idLength} characters`);
  }
  text(value: unknown, path: string, max: number, optional = false): boolean {
    if (value === undefined && optional) return true;
    if (typeof value !== 'string' || !value.trim()) return this.fail(path, 'must be a non-empty string');
    return value.length <= max || this.fail(path, `must be at most ${max} characters`);
  }
  oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string, optional = false): boolean {
    if (value === undefined && optional) return true;
    return (typeof value === 'string' && (allowed as readonly string[]).includes(value)) || this.fail(path, `must be one of ${allowed.join(', ')}`);
  }
  timestamp(value: unknown, path: string, optional = false): boolean {
    if (value === undefined && optional) return true;
    return (typeof value === 'number' && Number.isFinite(value) && value >= 0) || this.fail(path, 'must be a finite, non-negative timestamp');
  }
  nonNegative(value: unknown, path: string, optional = false): boolean {
    if (value === undefined && optional) return true;
    return (typeof value === 'number' && Number.isFinite(value) && value >= 0) || this.fail(path, 'must be a finite, non-negative number');
  }
  boolean(value: unknown, path: string): boolean {
    return typeof value === 'boolean' || this.fail(path, 'must be a boolean');
  }
  version(value: unknown, path: string): boolean {
    return value === MIO_CONTRACT_SCHEMA_VERSION || this.fail(path, `unsupported schema version ${JSON.stringify(value)} (expected ${MIO_CONTRACT_SCHEMA_VERSION})`);
  }
  array(value: unknown, path: string, max: number): value is unknown[] {
    if (!Array.isArray(value)) return this.fail(path, 'must be an array');
    return value.length <= max || this.fail(path, `must contain at most ${max} items`);
  }
  noSecrets(value: unknown, path: string): boolean {
    try { assertNoSecretFields(value); return true; } catch { return this.fail(path, 'must not contain secret-bearing fields'); }
  }
  result<T>(value: unknown): MioValidation<T> {
    return this.errors.length ? { ok: false, errors: this.errors } : { ok: true, value: value as T };
  }
}

const checkContext = (c: Checker, value: unknown, path: string): void => {
  if (!c.object(value, path)) return;
  c.id(value.taskId, `${path}.taskId`);
  c.id(value.traceId, `${path}.traceId`);
  c.oneOf(value.mode, MIO_SYSTEM_MODES, `${path}.mode`);
  c.oneOf(value.requestedBy, ['USER', 'AGENT'] as const, `${path}.requestedBy`);
  c.oneOf(value.privacy, MIO_PRIVACY_CLASSES, `${path}.privacy`);
  c.id(value.projectId, `${path}.projectId`, true);
  c.text(value.locale, `${path}.locale`, 35, true);
};

const checkPermission = (c: Checker, value: unknown, path: string): void => {
  if (!c.object(value, path)) return;
  c.oneOf(value.level, MIO_PERMISSION_LEVELS, `${path}.level`);
  c.text(value.action, `${path}.action`, MIO_CONTRACT_LIMITS.shortText);
  c.text(value.target, `${path}.target`, MIO_CONTRACT_LIMITS.shortText);
  c.text(value.networkOrigin, `${path}.networkOrigin`, MIO_CONTRACT_LIMITS.shortText, true);
  c.text(value.path, `${path}.path`, MIO_CONTRACT_LIMITS.longText, true);
  c.id(value.resourceId, `${path}.resourceId`, true);
  c.id(value.grantId, `${path}.grantId`, true);
};

const checkEvidence = (c: Checker, value: unknown, path: string): void => {
  if (!c.object(value, path)) return;
  c.id(value.id, `${path}.id`);
  c.oneOf(value.kind, MIO_EVIDENCE_KINDS, `${path}.kind`);
  c.text(value.label, `${path}.label`, MIO_CONTRACT_LIMITS.shortText);
  c.oneOf(value.status, MIO_EPISTEMIC_STATUSES, `${path}.status`);
  c.oneOf(value.trust, ['TRUSTED', 'UNTRUSTED'] as const, `${path}.trust`);
  c.text(value.sourceUri, `${path}.sourceUri`, MIO_CONTRACT_LIMITS.longText, true);
  c.text(value.excerpt, `${path}.excerpt`, MIO_CONTRACT_LIMITS.longText, true);
  c.timestamp(value.retrievedAt, `${path}.retrievedAt`);
};

const checkArtifact = (c: Checker, value: unknown, path: string): void => {
  if (!c.object(value, path)) return;
  c.id(value.id, `${path}.id`);
  c.oneOf(value.kind, MIO_ASSET_TYPES, `${path}.kind`);
  c.text(value.name, `${path}.name`, MIO_CONTRACT_LIMITS.shortText);
  c.oneOf(value.origin, MIO_ASSET_ORIGINS, `${path}.origin`);
  c.timestamp(value.createdAt, `${path}.createdAt`);
  c.id(value.projectId, `${path}.projectId`, true);
  c.text(value.uri, `${path}.uri`, MIO_CONTRACT_LIMITS.longText, true);
  c.text(value.mimeType, `${path}.mimeType`, 255, true);
  c.text(value.contentHash, `${path}.contentHash`, 255, true);
  if (value.producedBy !== undefined && c.object(value.producedBy, `${path}.producedBy`)) {
    c.id(value.producedBy.capabilityId, `${path}.producedBy.capabilityId`);
    c.id(value.producedBy.requestId, `${path}.producedBy.requestId`);
  }
};

const checkError = (c: Checker, value: unknown, path: string): void => {
  if (!c.object(value, path)) return;
  c.oneOf(value.code, MIO_RUNTIME_ERROR_CODES, `${path}.code`);
  c.text(value.message, `${path}.message`, MIO_CONTRACT_LIMITS.longText);
  c.boolean(value.retryable, `${path}.retryable`);
  c.oneOf(value.mutationState, ['NONE', 'COMMITTED', 'UNKNOWN'] as const, `${path}.mutationState`);
  c.id(value.capabilityId, `${path}.capabilityId`, true);
  c.text(value.detail, `${path}.detail`, MIO_CONTRACT_LIMITS.longText, true);
  // A failure whose mutation outcome is uncertain must never be marked as safely retryable.
  if (value.mutationState === 'UNKNOWN' && value.retryable === true) c.errors.push(`${path}.retryable: must be false when mutationState is UNKNOWN`);
};

const checkTrace = (c: Checker, value: unknown, path: string): void => {
  if (!c.object(value, path)) return;
  c.version(value.schemaVersion, `${path}.schemaVersion`);
  c.id(value.traceId, `${path}.traceId`);
  c.id(value.requestId, `${path}.requestId`);
  c.id(value.capabilityId, `${path}.capabilityId`);
  c.id(value.taskId, `${path}.taskId`);
  c.oneOf(value.status, TRACE_STATUSES, `${path}.status`);
  c.timestamp(value.startedAt, `${path}.startedAt`);
  c.timestamp(value.finishedAt, `${path}.finishedAt`, true);
  if (typeof value.startedAt === 'number' && typeof value.finishedAt === 'number' && value.finishedAt < value.startedAt) c.errors.push(`${path}.finishedAt: must not precede startedAt`);
  if (!c.array(value.spans, `${path}.spans`, MIO_CONTRACT_LIMITS.maxSpans)) return;
  const spanIds = new Set<string>();
  value.spans.forEach((span, index) => {
    const at = `${path}.spans[${index}]`;
    if (!c.object(span, at)) return;
    c.id(span.id, `${at}.id`);
    if (typeof span.id === 'string') { if (spanIds.has(span.id)) c.errors.push(`${at}.id: duplicate span id`); spanIds.add(span.id); }
    c.oneOf(span.kind, MIO_TRACE_SPAN_KINDS, `${at}.kind`);
    c.text(span.name, `${at}.name`, MIO_CONTRACT_LIMITS.shortText);
    c.timestamp(span.startedAt, `${at}.startedAt`);
    c.timestamp(span.finishedAt, `${at}.finishedAt`, true);
    c.oneOf(span.status, TRACE_STATUSES, `${at}.status`);
    c.id(span.parentId, `${at}.parentId`, true);
    c.oneOf(span.locality, ['LOCAL', 'REMOTE'] as const, `${at}.locality`, true);
    c.text(span.detail, `${at}.detail`, MIO_CONTRACT_LIMITS.longText, true);
    if (span.usage !== undefined && c.object(span.usage, `${at}.usage`)) {
      for (const key of ['inputTokens', 'outputTokens', 'estimatedCostUsd', 'actualCostUsd'] as const) c.nonNegative(span.usage[key], `${at}.usage.${key}`, true);
    }
  });
  value.spans.forEach((span, index) => {
    if (span && typeof span === 'object' && 'parentId' in span && typeof span.parentId === 'string' && !spanIds.has(span.parentId)) c.errors.push(`${path}.spans[${index}].parentId: references an unknown span`);
  });
};

export function validateMioContext(value: unknown): MioValidation<MioContext> {
  const c = new Checker(); checkContext(c, value, 'context'); return c.result(value);
}

export function validateMioPermission(value: unknown): MioValidation<MioPermission> {
  const c = new Checker(); checkPermission(c, value, 'permission'); return c.result(value);
}

export function validateMioEvidence(value: unknown): MioValidation<MioEvidence> {
  const c = new Checker(); checkEvidence(c, value, 'evidence'); return c.result(value);
}

export function validateMioArtifact(value: unknown): MioValidation<MioArtifact> {
  const c = new Checker(); checkArtifact(c, value, 'artifact'); return c.result(value);
}

export function validateMioRuntimeError(value: unknown): MioValidation<MioRuntimeError> {
  const c = new Checker(); checkError(c, value, 'error'); return c.result(value);
}

export function validateMioExecutionTrace(value: unknown): MioValidation<MioExecutionTrace> {
  const c = new Checker(); checkTrace(c, value, 'trace'); return c.result(value);
}

export function validateMioCapabilityRequest<I = unknown>(value: unknown): MioValidation<MioCapabilityRequest<I>> {
  const c = new Checker();
  if (!c.object(value, 'request')) return c.result(value);
  c.version(value.schemaVersion, 'request.schemaVersion');
  c.id(value.requestId, 'request.requestId');
  c.id(value.capabilityId, 'request.capabilityId');
  if (!('input' in value)) c.errors.push('request.input: is required');
  checkContext(c, value.context, 'request.context');
  checkPermission(c, value.permission, 'request.permission');
  if (value.budget !== undefined && c.object(value.budget, 'request.budget')) {
    c.nonNegative(value.budget.maxDurationMs, 'request.budget.maxDurationMs');
    c.nonNegative(value.budget.maxCostUsd, 'request.budget.maxCostUsd');
  }
  c.id(value.idempotencyKey, 'request.idempotencyKey', true);
  c.timestamp(value.createdAt, 'request.createdAt');
  c.noSecrets(value, 'request');
  return c.result(value);
}

export function validateMioCapabilityResult<O = unknown>(value: unknown): MioValidation<MioCapabilityResult<O>> {
  const c = new Checker();
  if (!c.object(value, 'result')) return c.result(value);
  c.version(value.schemaVersion, 'result.schemaVersion');
  c.id(value.requestId, 'result.requestId');
  c.id(value.capabilityId, 'result.capabilityId');
  c.oneOf(value.status, ['SUCCEEDED', 'FAILED', 'DENIED', 'CANCELLED'] as const, 'result.status');
  if (c.array(value.evidence, 'result.evidence', MIO_CONTRACT_LIMITS.maxEvidence)) value.evidence.forEach((item, index) => checkEvidence(c, item, `result.evidence[${index}]`));
  if (c.array(value.artifacts, 'result.artifacts', MIO_CONTRACT_LIMITS.maxArtifacts)) value.artifacts.forEach((item, index) => checkArtifact(c, item, `result.artifacts[${index}]`));
  checkTrace(c, value.trace, 'result.trace');
  if (c.object(value.trace, 'result.trace') && (value.trace.requestId !== value.requestId || value.trace.capabilityId !== value.capabilityId)) {
    c.errors.push('result.trace: must belong to the same request and capability');
  }
  if (value.status === 'SUCCEEDED') {
    if (!('output' in value)) c.errors.push('result.output: is required when status is SUCCEEDED');
    c.oneOf(value.validation, ['PASSED', 'NOT_REQUIRED'] as const, 'result.validation');
    if ('error' in value) c.errors.push('result.error: must be absent when status is SUCCEEDED');
  } else if (value.status !== undefined) {
    checkError(c, value.error, 'result.error');
    if ('output' in value) c.errors.push('result.output: must be absent when the capability did not succeed');
  }
  c.noSecrets(value, 'result');
  return c.result(value);
}
