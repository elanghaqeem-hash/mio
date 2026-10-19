import { NativeModelRegistry } from '../intelligence/model/NativeModelRegistry';
import { selectNativeModel } from '../intelligence/model/NativeModelSelectionPolicy';

export async function runNativeModelSelectionPolicyTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (ok: boolean, name: string) => {
    total++;
    if (ok) { passed++; console.log(`✓ [PASS] ${name}`); }
    else console.error(`✗ [FAIL] ${name}`);
  };
  const registry = new NativeModelRegistry();
  registry.register({ id: 'small', backend: 'ollama', model: 'local-small', capabilities: ['text'], contextWindow: 4096, memoryEstimateMiB: 2048 });
  registry.register({ id: 'big', backend: 'llamacpp', model: 'local-big', capabilities: ['text', 'reasoning'], contextWindow: 16384, memoryEstimateMiB: 8192 });
  registry.register({ id: 'unknown', backend: 'vllm', model: 'local-unknown', capabilities: ['text'], contextWindow: 8192 });
  const base = { requiredCapabilities: ['text'] as const, readyModelIds: ['big', 'small', 'unknown'] };
  assert(selectNativeModel(registry, base).selected?.id === 'small', 'Selects smallest known fitting model');
  assert(selectNativeModel(registry, { ...base, minimumContextWindow: 8000 }).selected?.id === 'big', 'Context filter excludes undersized models');
  assert(selectNativeModel(registry, { ...base, requiredCapabilities: ['reasoning'] }).selected?.id === 'big', 'Capability filter selects reasoning model');
  assert(selectNativeModel(registry, { ...base, readyModelIds: [] }).selected === null, 'Never selects unverified model');
  assert(selectNativeModel(registry, { ...base, availableMemoryMiB: 1024 }).selected === null, 'Rejects models exceeding memory budget');
  assert(selectNativeModel(registry, { ...base, readyModelIds: ['unknown'], availableMemoryMiB: 9000 }).selected === null, 'Unknown memory cannot bypass finite budget');
  assert(selectNativeModel(registry, { ...base, readyModelIds: ['unknown'] }).selected?.id === 'unknown', 'Unknown memory permitted only without memory budget');
  let invalid = false;
  try { selectNativeModel(registry, { ...base, minimumContextWindow: -1 }); } catch { invalid = true; }
  assert(invalid, 'Invalid context limits are rejected');
  return { passed, total };
}
