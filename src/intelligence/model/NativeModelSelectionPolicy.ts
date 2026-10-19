/**
 * T-1.05: deterministic, first-party model selection.
 * This filters only caller-supplied, previously health-checked model IDs.
 * Never infer operational readiness from registry metadata.
 */
import { NativeModelRegistry, type NativeModelCapability, type NativeModelDescriptor } from './NativeModelRegistry';

export interface NativeModelSelectionRequest {
  requiredCapabilities: readonly NativeModelCapability[];
  minimumContextWindow?: number;
  availableMemoryMiB?: number;
  /** Backend/model identities checked by the serving layer, not model metadata. */
  readyModelIds: readonly string[];
}

export type NativeModelSelection =
  | { selected: NativeModelDescriptor; eligibleCount: number }
  | { selected: null; eligibleCount: 0; reason: 'NO_READY_MODEL' | 'NO_CAPABILITY_MATCH' | 'INSUFFICIENT_RESOURCES' };

export function selectNativeModel(registry: NativeModelRegistry, request: NativeModelSelectionRequest): NativeModelSelection {
  if (!Array.isArray(request.readyModelIds) || request.readyModelIds.some(id => typeof id !== 'string')) {
    throw new Error('Invalid ready model IDs');
  }
  if (request.minimumContextWindow !== undefined &&
    (!Number.isSafeInteger(request.minimumContextWindow) || request.minimumContextWindow < 1)) {
    throw new Error('Invalid required context window');
  }
  if (request.availableMemoryMiB !== undefined &&
    (!Number.isSafeInteger(request.availableMemoryMiB) || request.availableMemoryMiB < 0)) {
    throw new Error('Invalid memory budget');
  }
  const readyIds = new Set(request.readyModelIds);
  const ready = registry.list().filter(model => readyIds.has(model.id));
  if (!ready.length) return { selected: null, eligibleCount: 0, reason: 'NO_READY_MODEL' };
  const compatible = registry.list(request.requiredCapabilities)
    .filter(model => readyIds.has(model.id) && model.contextWindow >= (request.minimumContextWindow ?? 1));
  if (!compatible.length) return { selected: null, eligibleCount: 0, reason: 'NO_CAPABILITY_MATCH' };
  const fitting = compatible.filter(model =>
    request.availableMemoryMiB === undefined ||
    (model.memoryEstimateMiB !== undefined && model.memoryEstimateMiB <= request.availableMemoryMiB));
  if (!fitting.length) return { selected: null, eligibleCount: 0, reason: 'INSUFFICIENT_RESOURCES' };
  // Prefer the smallest known resident footprint. Models with unknown footprint rank last;
  // tie-break by context capacity then stable identifier, never by unmeasured model quality.
  fitting.sort((a, b) =>
    (a.memoryEstimateMiB ?? Infinity) - (b.memoryEstimateMiB ?? Infinity) ||
    a.contextWindow - b.contextWindow ||
    a.id.localeCompare(b.id));
  return { selected: fitting[0], eligibleCount: fitting.length };
}
