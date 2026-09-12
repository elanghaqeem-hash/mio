import { ToolRegistry } from '../orchestrator/tools/ToolRegistry';
import { ToolRouter } from '../orchestrator/tools/ToolRouter';
import { CapabilityRegistry } from '../security/CapabilityRegistry';
import type { CapabilityDescriptor } from '../types/capabilities';

export async function runToolRouterTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ [PASS] ${name}`);
    } else {
      console.error(`✗ [FAIL] ${name}`);
    }
  };

  const capabilities = new CapabilityRegistry();
  const registerCapability = (descriptor: Pick<CapabilityDescriptor, 'id' | 'description' | 'riskLevel' | 'permissionLevel' | 'timeoutMs'>) => {
    capabilities.register({
      ...descriptor,
      kind: 'TOOL',
      ownerLayer: 'ORCHESTRATOR',
      modes: ['CHAT'],
      availability: 'AVAILABLE',
      networkAccess: false,
      scopeFields: ['TASK', 'TOOL'],
    });
  };

  registerCapability({ id: 'test.echo', description: 'Echo validated text', riskLevel: 'LOW', permissionLevel: 'L1_SUGGEST', timeoutMs: 1000 });
  registerCapability({ id: 'test.underprivileged', description: 'Deliberately invalid risk/permission declaration', riskLevel: 'HIGH', permissionLevel: 'L1_SUGGEST', timeoutMs: 1000 });
  registerCapability({ id: 'test.bad-output', description: 'Returns output that fails validation', riskLevel: 'LOW', permissionLevel: 'L1_SUGGEST', timeoutMs: 1000 });
  registerCapability({ id: 'test.timeout', description: 'Deliberately exceeds sandbox timeout', riskLevel: 'LOW', permissionLevel: 'L1_SUGGEST', timeoutMs: 5 });

  const registry = new ToolRegistry(capabilities);
  registry.register({
    id: 'test.echo',
    description: 'Echo validated text',
    modes: ['CHAT'],
    riskLevel: 'LOW',
    permissionLevel: 'L1_SUGGEST',
    timeoutMs: 1000,
    validateInput: (input: unknown): input is { text: string } => {
      return Boolean(input && typeof input === 'object' && typeof (input as { text?: unknown }).text === 'string');
    },
    execute: async (input) => ({ echoed: input.text }),
    validateOutput: (output) => typeof output.echoed === 'string',
  });

  registry.register({
    id: 'test.underprivileged',
    description: 'Deliberately invalid risk/permission declaration',
    modes: ['CHAT'],
    riskLevel: 'HIGH',
    permissionLevel: 'L1_SUGGEST',
    timeoutMs: 1000,
    validateInput: (_input: unknown): _input is Record<string, never> => true,
    execute: async () => ({ ok: true }),
  });

  registry.register({
    id: 'test.bad-output',
    description: 'Returns output that fails validation',
    modes: ['CHAT'],
    riskLevel: 'LOW',
    permissionLevel: 'L1_SUGGEST',
    timeoutMs: 1000,
    validateInput: (_input: unknown): _input is Record<string, never> => true,
    execute: async () => ({ valid: false }),
    validateOutput: (output) => output.valid === true,
  });

  registry.register({
    id: 'test.timeout',
    description: 'Deliberately exceeds sandbox timeout',
    modes: ['CHAT'],
    riskLevel: 'LOW',
    permissionLevel: 'L1_SUGGEST',
    timeoutMs: 5,
    validateInput: (_input: unknown): _input is Record<string, never> => true,
    execute: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { ok: true };
    },
  });

  const router = new ToolRouter(registry, capabilities);
  const context = (suffix: string) => ({ taskId: `task_test_${suffix}`, mode: 'CHAT' as const, requestedBy: 'AGENT' as const });

  const success = await router.execute<{ echoed: string }>('test.echo', { text: 'hello' }, context('success'));
  assert(success.success && success.data?.echoed === 'hello', 'ToolRouter executes registered low-risk tool through manifest, permission, and sandbox gates');

  const unknown = await router.execute('test.missing', {}, context('unknown'));
  assert(!unknown.success && unknown.error?.includes('not registered') === true, 'ToolRouter rejects unknown/unregistered tool identifiers');

  const invalidInput = await router.execute('test.echo', { nope: true }, context('invalid-input'));
  assert(!invalidInput.success && invalidInput.validation === 'FAILED', 'ToolRouter rejects invalid tool input before execution');

  const insufficient = await router.execute('test.underprivileged', {}, context('underprivileged'));
  assert(!insufficient.success && insufficient.error?.includes('insufficient') === true, 'RiskAnalyzer blocks tools whose permission declaration is below risk requirement');

  const badOutput = await router.execute('test.bad-output', {}, context('bad-output'));
  assert(!badOutput.success && badOutput.error?.includes('output validation') === true, 'ToolRouter blocks invalid tool output');

  const timeout = await router.execute('test.timeout', {}, context('timeout'));
  assert(!timeout.success && timeout.error?.includes('timed out') === true, 'Sandbox timeout stops overlong tool execution');

  return { passed, total };
}
