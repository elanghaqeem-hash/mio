import { NativeModelRegistry } from '../intelligence/model/NativeModelRegistry';

export async function runNativeModelRegistryTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total++;
    if (condition) { passed++; console.log(`✓ [PASS] ${name}`); }
    else console.error(`✗ [FAIL] ${name}`);
  };
  const registry = new NativeModelRegistry();
  registry.register({ id: 'local:qwen', backend: 'ollama', model: 'qwen3:8b', capabilities: ['text', 'reasoning'], contextWindow: 8192, memoryEstimateMiB: 6144 });
  registry.register({ id: 'local:embed', backend: 'llamacpp', model: 'embed-local', capabilities: ['embeddings'], contextWindow: 2048 });
  assert(registry.list().length === 2, 'Registry stores distinct local model descriptors');
  assert(registry.list(['reasoning']).length === 1 && registry.list(['embeddings'])[0]?.id === 'local:embed', 'Capability filtering is deterministic');
  let duplicateRejected = false;
  try { registry.register({ id: 'local:qwen', backend: 'ollama', model: 'other', capabilities: ['text'], contextWindow: 4096 }); }
  catch { duplicateRejected = true; }
  assert(duplicateRejected, 'Registry refuses duplicate ids');
  let invalidRejected = false;
  try { registry.register({ id: 'bad endpoint', backend: 'ollama', model: 'test', capabilities: ['text'], contextWindow: 1 }); }
  catch { invalidRejected = true; }
  assert(invalidRejected, 'Registry refuses invalid ids');
  let capabilityRejected = false;
  try { registry.register({ id: 'invalid-cap', backend: 'ollama', model: 'test', capabilities: ['text', 'text'], contextWindow: 1 }); }
  catch { capabilityRejected = true; }
  assert(capabilityRejected, 'Registry refuses duplicate capability claims');
  const item = registry.get('local:qwen');
  let mutationPrevented = false;
  try { (item!.capabilities as string[]).push('vision'); } catch { mutationPrevented = true; }
  assert(mutationPrevented || registry.list(['vision']).length === 0, 'Registry metadata is immutable');
  assert(registry.unregister('local:qwen') && registry.list().length === 1, 'Registry permits removal');
  return { passed, total };
}
