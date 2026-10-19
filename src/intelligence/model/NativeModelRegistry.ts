/**
 * T-1.02: first-party inventory for local models.
 * Registry metadata is not evidence of an installed or usable model.
 * The serving backend must independently pass a readiness probe.
 */
import type { LocalInferenceBackendId } from '../../types/models';

export type NativeModelCapability =
  | 'text' | 'reasoning' | 'coding' | 'json' | 'tool_calling'
  | 'vision' | 'audio' | 'embeddings';

export interface NativeModelDescriptor {
  id: string;
  backend: LocalInferenceBackendId;
  model: string;
  capabilities: readonly NativeModelCapability[];
  contextWindow: number;
  memoryEstimateMiB?: number;
}

const CAPABILITIES = new Set<NativeModelCapability>([
  'text', 'reasoning', 'coding', 'json', 'tool_calling', 'vision', 'audio', 'embeddings',
]);
const BACKENDS = new Set<LocalInferenceBackendId>(['ollama', 'vllm', 'llamacpp']);
const MAX_MODELS = 256;

function validatedDescriptor(value: NativeModelDescriptor): NativeModelDescriptor {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value.id)) {
    throw new Error('Invalid local model registry id');
  }
  if (!BACKENDS.has(value.backend)) throw new Error('Unsupported local inference backend');
  if (typeof value.model !== 'string' || !value.model.trim() || value.model.length > 256) {
    throw new Error('Invalid local model name');
  }
  if (!Number.isSafeInteger(value.contextWindow) || value.contextWindow < 1 || value.contextWindow > 2_000_000) {
    throw new Error('Invalid local model context window');
  }
  if (value.memoryEstimateMiB !== undefined &&
    (!Number.isSafeInteger(value.memoryEstimateMiB) || value.memoryEstimateMiB < 1 || value.memoryEstimateMiB > 1_000_000)) {
    throw new Error('Invalid local model memory estimate');
  }
  if (!Array.isArray(value.capabilities) || value.capabilities.length === 0 ||
    value.capabilities.some(capability => !CAPABILITIES.has(capability)) ||
    new Set(value.capabilities).size !== value.capabilities.length) {
    throw new Error('Invalid local model capabilities');
  }
  return Object.freeze({
    id: value.id,
    backend: value.backend,
    model: value.model,
    capabilities: Object.freeze([...value.capabilities]),
    contextWindow: value.contextWindow,
    ...(value.memoryEstimateMiB !== undefined ? { memoryEstimateMiB: value.memoryEstimateMiB } : {}),
  });
}

export class NativeModelRegistry {
  private readonly models = new Map<string, NativeModelDescriptor>();

  register(value: NativeModelDescriptor): void {
    const descriptor = validatedDescriptor(value);
    if (!this.models.has(descriptor.id) && this.models.size >= MAX_MODELS) {
      throw new Error('Local model registry capacity exceeded');
    }
    if (this.models.has(descriptor.id)) throw new Error('Duplicate local model registry id');
    this.models.set(descriptor.id, descriptor);
  }

  unregister(id: string): boolean { return this.models.delete(id); }

  get(id: string): NativeModelDescriptor | undefined { return this.models.get(id); }

  list(requiredCapabilities: readonly NativeModelCapability[] = []): readonly NativeModelDescriptor[] {
    if (requiredCapabilities.some(capability => !CAPABILITIES.has(capability))) {
      throw new Error('Unsupported required model capability');
    }
    return [...this.models.values()]
      .filter(model => requiredCapabilities.every(capability => model.capabilities.includes(capability)))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
