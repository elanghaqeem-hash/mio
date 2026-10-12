// MIO-PRV-05.01: the capability manifest. One declaration per capability carries everything the protocol
// needs to admit, bound, cancel, validate, and audit a call: the existing CapabilityDescriptor (identity,
// modes, risk, permission, scope, timeout) plus I/O schemas, size limits, cancellation, audit, and mutation.
import { MIO_PERMISSION_LEVELS } from '../contracts/MioContracts';
import type { CapabilityDescriptor } from '../types/capabilities';

export const MIO_CAPABILITY_MANIFEST_VERSION = 1 as const;

export const MIO_CAPABILITY_DOMAINS = ['FILES', 'RESEARCH', 'MEMORY', 'MODEL', 'CREATIVE', 'VOICE', 'PROJECT', 'AGENT', 'TRAINING', 'BROWSER', 'SYSTEM'] as const;
export type MioCapabilityDomain = (typeof MIO_CAPABILITY_DOMAINS)[number];

/**
 * How a running call is stopped. ABORT_SIGNAL: the executor honours the AbortSignal mid-call.
 * BETWEEN_STEPS: work stops at the next step boundary. NONE: the call is short and runs to completion.
 */
export type MioCapabilityCancellation = 'ABORT_SIGNAL' | 'BETWEEN_STEPS' | 'NONE';
export type MioCapabilityAuditPolicy = 'ALWAYS' | 'ON_FAILURE';

/** A deliberately small JSON-Schema subset: enough to bound and type every capability boundary, nothing more. */
export type MioJsonSchema =
  | { type: 'string'; minLength?: number; maxLength?: number; enum?: readonly string[] }
  | { type: 'number' | 'integer'; minimum?: number; maximum?: number }
  | { type: 'boolean' }
  | { type: 'null' }
  | { type: 'array'; items: MioJsonSchema; maxItems?: number }
  | { type: 'object'; properties: Readonly<Record<string, MioJsonSchema>>; required?: readonly string[]; additionalProperties?: boolean }
  | { type: 'any' };

export interface MioCapabilityManifest extends CapabilityDescriptor {
  manifestVersion: typeof MIO_CAPABILITY_MANIFEST_VERSION;
  domain: MioCapabilityDomain;
  inputSchema: MioJsonSchema;
  outputSchema: MioJsonSchema;
  limits: { maxInputBytes: number; maxOutputBytes: number };
  cancellation: MioCapabilityCancellation;
  audit: MioCapabilityAuditPolicy;
  /** True when a call can change state outside the call itself (files, memory, project, playback). */
  mutates: boolean;
}

const MAX_SCHEMA_DEPTH = 8;
const MAX_ERRORS = 20;

/** Validates `value` against `schema`; returns human-readable errors (empty when valid). Fails closed on depth. */
export function validateAgainstSchema(value: unknown, schema: MioJsonSchema, path = 'input', depth = 0, errors: string[] = []): string[] {
  if (errors.length >= MAX_ERRORS) return errors;
  if (depth > MAX_SCHEMA_DEPTH) { errors.push(`${path}: nesting exceeds ${MAX_SCHEMA_DEPTH} levels`); return errors; }
  const fail = (message: string) => { errors.push(`${path}: ${message}`); return errors; };
  switch (schema.type) {
    case 'any':
      return errors;
    case 'null':
      return value === null ? errors : fail('must be null');
    case 'boolean':
      return typeof value === 'boolean' ? errors : fail('must be a boolean');
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail('must be a finite number');
      if (schema.type === 'integer' && !Number.isInteger(value)) return fail('must be an integer');
      if (schema.minimum !== undefined && value < schema.minimum) return fail(`must be at least ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) return fail(`must be at most ${schema.maximum}`);
      return errors;
    case 'string':
      if (typeof value !== 'string') return fail('must be a string');
      if (schema.minLength !== undefined && value.trim().length < schema.minLength) return fail(`must have at least ${schema.minLength} non-blank characters`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength) return fail(`must be at most ${schema.maxLength} characters`);
      if (schema.enum && !schema.enum.includes(value)) return fail(`must be one of ${schema.enum.join(', ')}`);
      return errors;
    case 'array':
      if (!Array.isArray(value)) return fail('must be an array');
      if (schema.maxItems !== undefined && value.length > schema.maxItems) return fail(`must have at most ${schema.maxItems} items`);
      value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${path}[${index}]`, depth + 1, errors));
      return errors;
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail('must be an object');
      const record = value as Record<string, unknown>;
      for (const key of schema.required ?? []) if (record[key] === undefined) fail(`.${key} is required`);
      for (const [key, child] of Object.entries(record)) {
        const childSchema = schema.properties[key];
        if (!childSchema) { if (schema.additionalProperties !== true) fail(`.${key} is not allowed`); continue; }
        if (child !== undefined) validateAgainstSchema(child, childSchema, `${path}.${key}`, depth + 1, errors);
      }
      return errors;
    }
    default:
      return fail('has an unsupported schema type');
  }
}

/** Byte size of the JSON encoding, or Infinity when the value cannot be encoded (cycles, BigInt). */
export function jsonByteLength(value: unknown): number {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? 0 : new TextEncoder().encode(text).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

const permissionRank = (level: string) => (MIO_PERMISSION_LEVELS as readonly string[]).indexOf(level);

/**
 * Structural rules every manifest must satisfy. A capability that can mutate state must be audited on every
 * call, declare at least L2 permission, and be cancellable. A network capability needs at least L2, except model
 * inference, whose remote routes carry their own L4 grant inside ModelRouter.
 */
export function validateCapabilityManifest(manifest: MioCapabilityManifest): string[] {
  const errors: string[] = [];
  const at = `manifest '${manifest.id}'`;
  if (manifest.manifestVersion !== MIO_CAPABILITY_MANIFEST_VERSION) errors.push(`${at}: unsupported manifestVersion`);
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(manifest.id)) errors.push(`${at}: id must be lowercase dotted`);
  if (!(MIO_CAPABILITY_DOMAINS as readonly string[]).includes(manifest.domain)) errors.push(`${at}: unknown domain`);
  if (!manifest.modes.length) errors.push(`${at}: must declare at least one mode`);
  if (!(manifest.timeoutMs > 0)) errors.push(`${at}: timeout must be positive`);
  for (const [name, limit] of Object.entries(manifest.limits)) if (!Number.isInteger(limit) || limit <= 0) errors.push(`${at}: limits.${name} must be a positive integer`);
  if (manifest.inputSchema.type !== 'object') errors.push(`${at}: inputSchema must describe an object`);
  if (manifest.mutates && manifest.audit !== 'ALWAYS') errors.push(`${at}: a mutating capability must be audited on every call`);
  if (manifest.mutates && permissionRank(manifest.permissionLevel) < permissionRank('L2_CREATE')) errors.push(`${at}: a mutating capability must require at least L2_CREATE`);
  if (manifest.mutates && manifest.cancellation === 'NONE' && manifest.timeoutMs > 5_000) errors.push(`${at}: a long-running mutating capability must be cancellable`);
  if (manifest.networkAccess && permissionRank(manifest.permissionLevel) < permissionRank('L2_CREATE') && manifest.domain !== 'MODEL') errors.push(`${at}: a network capability must require at least L2_CREATE`);
  if ((manifest.riskLevel === 'HIGH' || manifest.riskLevel === 'CRITICAL') && manifest.audit !== 'ALWAYS') errors.push(`${at}: a high-risk capability must be audited on every call`);
  return errors;
}

/** The descriptor part of a manifest, as the CapabilityRegistry stores it. */
export function descriptorOf(manifest: MioCapabilityManifest): CapabilityDescriptor {
  const { id, kind, description, ownerLayer, modes, riskLevel, permissionLevel, availability, networkAccess, scopeFields, timeoutMs } = manifest;
  return { id, kind, description, ownerLayer, modes: [...modes], riskLevel, permissionLevel, availability, networkAccess, scopeFields: [...scopeFields], timeoutMs };
}
