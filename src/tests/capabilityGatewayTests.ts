import { CapabilityRegistry, createDefaultCapabilityRegistry } from '../security/CapabilityRegistry';
import { ExecutionLedgerController } from '../security/ExecutionLedger';
import { SecureServiceGateway } from '../services/SecureServiceGateway';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { ToolRegistry } from '../orchestrator/tools/ToolRegistry';

interface SuiteResult { passed: number; total: number; }

export async function runCapabilityGatewayTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`CapabilityGateway test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const defaultManifest = createDefaultCapabilityRegistry();
  const unknown = defaultManifest.authorize('tool.not-declared', {
    taskId: 'cap_unknown', mode: 'CHAT', projectId: 'project-alpha', requestedBy: 'AGENT', toolId: 'tool.not-declared',
  });
  check(!unknown.allowed && unknown.reason?.includes('not registered') === true, 'CapabilityRegistry defaults to deny for undeclared capabilities');

  const unavailable = defaultManifest.authorize('service.filesystem', {
    taskId: 'cap_fs', mode: 'FILES', projectId: 'project-alpha', requestedBy: 'AGENT', path: '/workspace/report.txt',
  });
  check(!unavailable.allowed && unavailable.reason?.includes('unavailable') === true, 'Declared but unavailable services cannot be executed');

  const wrongMode = defaultManifest.authorize('project.inspect', {
    taskId: 'cap_mode', mode: 'MUSIC', projectId: 'project-alpha', requestedBy: 'AGENT', toolId: 'project.inspect',
  });
  check(!wrongMode.allowed && wrongMode.reason?.includes('MUSIC') === true, 'Capability mode envelope is enforced at runtime');

  let missingManifestRejected = false;
  try {
    new ToolRegistry(new CapabilityRegistry()).register({
      id: 'test.no-manifest', description: 'No manifest fixture', modes: ['CHAT'], riskLevel: 'LOW', permissionLevel: 'L1_SUGGEST', timeoutMs: 1000,
      validateInput: (_input: unknown): _input is Record<string, never> => true,
      execute: async () => ({ ok: true }),
    });
  } catch (error) {
    missingManifestRejected = error instanceof Error && error.message.includes('no capability manifest');
  }
  check(missingManifestRejected, 'ToolRegistry rejects tools that do not exist in the capability manifest');

  const driftManifest = new CapabilityRegistry();
  driftManifest.register({
    id: 'test.drift', kind: 'TOOL', description: 'Manifest metadata drift fixture', ownerLayer: 'ORCHESTRATOR', modes: ['CHAT'],
    riskLevel: 'HIGH', permissionLevel: 'L4_EXECUTE', availability: 'AVAILABLE', networkAccess: false, scopeFields: ['TASK', 'TOOL'], timeoutMs: 1000,
  });
  let driftRejected = false;
  try {
    new ToolRegistry(driftManifest).register({
      id: 'test.drift', description: 'Manifest metadata drift fixture', modes: ['CHAT'], riskLevel: 'LOW', permissionLevel: 'L1_SUGGEST', timeoutMs: 1000,
      validateInput: (_input: unknown): _input is Record<string, never> => true,
      execute: async () => ({ ok: true }),
    });
  } catch (error) {
    driftRejected = error instanceof Error && error.message.includes('permission metadata differs');
  }
  check(driftRejected, 'Tool registration fails closed when code metadata drifts from the central manifest');

  const serviceManifest = new CapabilityRegistry();
  serviceManifest.register({
    id: 'service.test.echo', kind: 'SERVICE', description: 'Bounded service echo fixture', ownerLayer: 'SERVICE', modes: ['PROJECT'],
    riskLevel: 'LOW', permissionLevel: 'L1_SUGGEST', availability: 'AVAILABLE', networkAccess: false,
    scopeFields: ['TASK', 'PROJECT', 'RESOURCE'], timeoutMs: 1000,
  });
  serviceManifest.register({
    id: 'service.test.disabled', kind: 'SERVICE', description: 'Disabled service fixture', ownerLayer: 'SERVICE', modes: ['PROJECT'],
    riskLevel: 'LOW', permissionLevel: 'L1_SUGGEST', availability: 'UNAVAILABLE', networkAccess: false,
    scopeFields: ['TASK', 'PROJECT'], timeoutMs: 1000,
  });

  const gateway = new SecureServiceGateway(serviceManifest);
  gateway.register({
    id: 'service.test.echo',
    validateInput: (input: unknown): input is { text: string } => Boolean(input && typeof input === 'object' && typeof (input as { text?: unknown }).text === 'string'),
    execute: async (input) => ({ echoed: input.text }),
    validateOutput: (output) => typeof output.echoed === 'string',
  });

  let disabledRegistrationRejected = false;
  try {
    gateway.register({
      id: 'service.test.disabled',
      validateInput: (_input: unknown): _input is Record<string, never> => true,
      execute: async () => ({ ok: true }),
    });
  } catch (error) {
    disabledRegistrationRejected = error instanceof Error && error.message.includes('unavailable');
  }
  check(disabledRegistrationRejected, 'SecureServiceGateway refuses handlers for manifest-declared unavailable services');

  const serviceTask = `service_task_${Date.now()}`;
  const serviceResult = await gateway.execute<{ echoed: string }>('service.test.echo', { text: 'bounded' }, {
    taskId: serviceTask, mode: 'PROJECT', projectId: 'project-alpha', requestedBy: 'AGENT', resourceId: 'project:project-alpha',
  });
  check(serviceResult.success && serviceResult.data?.echoed === 'bounded', 'SecureServiceGateway executes available service through capability, resource, permission, sandbox, and validation gates');

  const missingResource = await gateway.execute('service.test.echo', { text: 'blocked' }, {
    taskId: 'service_missing_resource', mode: 'PROJECT', projectId: 'project-alpha', requestedBy: 'AGENT',
  });
  check(!missingResource.success && missingResource.error?.includes('Resource scope') === true, 'Service capability fails closed when a required resource scope is absent');

  const storage = new InMemoryStorageProvider();
  const ledger = new ExecutionLedgerController();
  ledger.setStorageProvider(storage);
  await ledger.initialize();
  ledger.clear();
  const ledgerTask = `cap_ledger_${Date.now()}`;
  serviceManifest.authorize('service.test.echo', {
    taskId: ledgerTask, mode: 'PROJECT', projectId: 'project-alpha', requestedBy: 'AGENT', resourceId: 'project:project-alpha',
  });
  await ledger.flush();
  const reloaded = new ExecutionLedgerController();
  reloaded.setStorageProvider(storage);
  await reloaded.initialize();
  check(reloaded.getForTask(ledgerTask).some((entry) => entry.category === 'SECURITY' && entry.action === 'CAPABILITY:service.test.echo' && entry.outcome === 'ALLOWED'), 'Capability decisions persist in the task execution ledger');

  return { passed, total };
}
