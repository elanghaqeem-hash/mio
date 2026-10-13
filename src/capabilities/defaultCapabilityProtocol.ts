// MIO-PRV-05.02: manifests and executors for files, research, memory, model inference, creative, and voice.
// Capabilities that already exist keep their CapabilityRegistry descriptor as the single source of identity,
// risk, permission, scope, and timeout; the protocol adds only the manifest fields. New capabilities (memory,
// model, voice) are declared here in full and execute through the existing governed subsystems.
import { ModelRouter } from '../agents/ModelRouter';
import { MemoryContextManager } from '../memory/MemoryContextManager';
import { ToolRouter } from '../orchestrator/tools/ToolRouter';
import { CapabilityRegistry } from '../security/CapabilityRegistry';
import type { SecureServiceGateway } from '../services/SecureServiceGateway';
import { mioChatVoice } from '../services/voice/MioChatVoiceController';
import type { CapabilityDescriptor } from '../types/capabilities';
import type { MioRuntimeErrorCode } from '../contracts/MioContracts';
import { MIO_CAPABILITY_MANIFEST_VERSION, type MioCapabilityManifest, type MioJsonSchema } from './CapabilityManifest';
import { CapabilityProtocol, type MioCapabilityExecutor, type MioCapabilityOutcome } from './CapabilityProtocol';

type ManifestExtras = Omit<MioCapabilityManifest, keyof CapabilityDescriptor | 'manifestVersion'>;

const KIB = 1024;
const anyObject: MioJsonSchema = { type: 'object', properties: {}, additionalProperties: true };
const ALL_MODES: CapabilityDescriptor['modes'] = ['CHAT', 'RESEARCH', 'FILES', 'MOTION', '3D', 'ANIMATION', 'MOTION_2D', 'GRAPHIC', 'DRAWING', 'PHOTO', 'SFX', 'MUSIC', 'PROJECT', 'TASKS', 'SETTINGS', 'SECURITY'];

/** Extras for capabilities whose descriptor already lives in the CapabilityRegistry. */
export const EXISTING_CAPABILITY_EXTRAS: Readonly<Record<string, ManifestExtras>> = {
  'project.inspect': {
    domain: 'PROJECT',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, activeMode: { type: 'string' }, assetCount: { type: 'integer', minimum: 0 }, lastModified: { type: 'number' } }, required: ['id', 'name', 'assetCount'] },
    limits: { maxInputBytes: 256, maxOutputBytes: 4 * KIB },
    cancellation: 'NONE',
    audit: 'ON_FAILURE',
    mutates: false,
  },
  'research.search': {
    domain: 'RESEARCH',
    inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 1000 } }, required: ['query'] },
    outputSchema: { type: 'object', properties: { sources: { type: 'array', items: anyObject, maxItems: 100 }, providerErrors: { type: 'array', items: { type: 'any' }, maxItems: 50 } }, required: ['sources', 'providerErrors'], additionalProperties: true },
    limits: { maxInputBytes: 2 * KIB, maxOutputBytes: 2 * 1024 * KIB },
    cancellation: 'ABORT_SIGNAL',
    audit: 'ALWAYS',
    mutates: false,
  },
  'creative.execute': {
    domain: 'CREATIVE',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string', minLength: 1, maxLength: 4000 }, requestedMode: { type: 'string', enum: ['3D', 'ANIMATION', 'MOTION_2D', 'GRAPHIC', 'DRAWING', 'PHOTO', 'SFX', 'MUSIC'] } }, required: ['prompt', 'requestedMode'] },
    outputSchema: { type: 'object', properties: { completed: { type: 'boolean' }, outputAssetIds: { type: 'array', items: { type: 'string' }, maxItems: 100 }, steps: { type: 'array', items: anyObject, maxItems: 100 } }, required: ['completed', 'outputAssetIds', 'steps'], additionalProperties: true },
    limits: { maxInputBytes: 16 * KIB, maxOutputBytes: 256 * KIB },
    cancellation: 'BETWEEN_STEPS',
    audit: 'ALWAYS',
    mutates: true,
  },
  'service.desktop.workspace.read-text': {
    domain: 'FILES',
    inputSchema: { type: 'object', properties: { workspaceId: { type: 'string', minLength: 1, maxLength: 200 }, relativePath: { type: 'string', maxLength: 4096 } }, required: ['workspaceId', 'relativePath'] },
    outputSchema: anyObject,
    limits: { maxInputBytes: 8 * KIB, maxOutputBytes: 4 * 1024 * KIB },
    cancellation: 'NONE',
    audit: 'ON_FAILURE',
    mutates: false,
  },
  'service.desktop.workspace.list': {
    domain: 'FILES',
    inputSchema: { type: 'object', properties: { workspaceId: { type: 'string', minLength: 1, maxLength: 200 }, relativePath: { type: 'string', maxLength: 4096 } }, required: ['workspaceId', 'relativePath'] },
    outputSchema: anyObject,
    limits: { maxInputBytes: 8 * KIB, maxOutputBytes: 1024 * KIB },
    cancellation: 'NONE',
    audit: 'ON_FAILURE',
    mutates: false,
  },
};

/** Capabilities introduced by the protocol itself. */
export const NEW_CAPABILITY_MANIFESTS: readonly MioCapabilityManifest[] = [
  {
    manifestVersion: MIO_CAPABILITY_MANIFEST_VERSION,
    id: 'memory.recall',
    kind: 'SERVICE',
    description: 'Read the governed memory of the active project (user-approved and system-derived items, each with its trust label) without changing it.',
    ownerLayer: 'SERVICE',
    modes: ALL_MODES,
    riskLevel: 'LOW',
    permissionLevel: 'L0_OBSERVE',
    availability: 'AVAILABLE',
    networkAccess: false,
    scopeFields: ['TASK', 'PROJECT'],
    timeoutMs: 5000,
    domain: 'MEMORY',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', maxItems: 50, items: { type: 'object', properties: { id: { type: 'string' }, content: { type: 'string', maxLength: 4000 }, trust: { type: 'string' }, layer: { type: 'string' }, updatedAt: { type: 'number' } }, required: ['id', 'content', 'trust'] } } }, required: ['items'] },
    limits: { maxInputBytes: 256, maxOutputBytes: 256 * KIB },
    cancellation: 'NONE',
    audit: 'ON_FAILURE',
    mutates: false,
  },
  {
    manifestVersion: MIO_CAPABILITY_MANIFEST_VERSION,
    id: 'model.generate',
    kind: 'SERVICE',
    description: 'Generate text with the configured model route. Local and free routes run directly; remote and paid routes keep ModelRouter\'s own L4 permission, budget, and provenance gates.',
    ownerLayer: 'SERVICE',
    modes: ALL_MODES,
    riskLevel: 'MODERATE',
    permissionLevel: 'L1_SUGGEST',
    availability: 'AVAILABLE',
    networkAccess: true,
    scopeFields: ['TASK', 'PROJECT'],
    timeoutMs: 60000,
    domain: 'MODEL',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string', minLength: 1, maxLength: 50000 }, system: { type: 'string', maxLength: 20000 }, maxOutputTokens: { type: 'integer', minimum: 16, maximum: 8192 }, temperature: { type: 'number', minimum: 0, maximum: 1 } }, required: ['prompt'] },
    outputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1 }, provider: { type: 'string' }, model: { type: 'string' }, source: { type: 'string' } }, required: ['text', 'provider'] },
    limits: { maxInputBytes: 96 * KIB, maxOutputBytes: 256 * KIB },
    cancellation: 'ABORT_SIGNAL',
    audit: 'ON_FAILURE',
    mutates: false,
  },
  {
    manifestVersion: MIO_CAPABILITY_MANIFEST_VERSION,
    id: 'voice.speak',
    kind: 'SERVICE',
    description: 'Speak a short reply aloud with the configured Mio voice provider; STOP MIO and cancellation end playback.',
    ownerLayer: 'SERVICE',
    modes: ALL_MODES,
    riskLevel: 'LOW',
    permissionLevel: 'L1_SUGGEST',
    availability: 'AVAILABLE',
    networkAccess: false,
    scopeFields: ['TASK'],
    timeoutMs: 120000,
    domain: 'VOICE',
    inputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 4000 } }, required: ['text'] },
    outputSchema: { type: 'object', properties: { spoken: { type: 'boolean' } }, required: ['spoken'] },
    limits: { maxInputBytes: 16 * KIB, maxOutputBytes: 256 },
    cancellation: 'ABORT_SIGNAL',
    audit: 'ON_FAILURE',
    mutates: false,
  },
  {
    manifestVersion: MIO_CAPABILITY_MANIFEST_VERSION,
    id: 'voice.stop',
    kind: 'SERVICE',
    description: 'Stop Mio speech, listening, and barge-in immediately.',
    ownerLayer: 'SERVICE',
    modes: ALL_MODES,
    riskLevel: 'LOW',
    permissionLevel: 'L0_OBSERVE',
    availability: 'AVAILABLE',
    networkAccess: false,
    scopeFields: ['TASK'],
    timeoutMs: 5000,
    domain: 'VOICE',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { stopped: { type: 'boolean' } }, required: ['stopped'] },
    limits: { maxInputBytes: 64, maxOutputBytes: 64 },
    cancellation: 'NONE',
    audit: 'ON_FAILURE',
    mutates: false,
  },
];

/** Maps the free-text failures of ToolRouter/SecureServiceGateway onto runtime error codes. */
export function classifyLegacyFailure(message: string | undefined): MioRuntimeErrorCode {
  const text = message ?? '';
  if (/permission denied|scope mismatch|permission declaration|not authorized|scope is required/i.test(text)) return 'PERMISSION_DENIED';
  if (/cancel/i.test(text)) return 'CANCELLED';
  if (/budget/i.test(text)) return 'BUDGET_EXCEEDED';
  if (/policy/i.test(text)) return 'POLICY_BLOCKED';
  if (/validation failed/i.test(text)) return 'VALIDATION_FAILED';
  if (/timed out|timeout/i.test(text)) return 'TIMEOUT';
  if (/not registered|unavailable/i.test(text)) return 'CAPABILITY_UNAVAILABLE';
  return 'PROVIDER_FAILED';
}

export function toolExecutor(router: ToolRouter, toolId: string): MioCapabilityExecutor {
  return async (input, context): Promise<MioCapabilityOutcome> => {
    const result = await router.execute(toolId, input, { taskId: context.taskId, mode: context.mode, projectId: context.projectId, requestedBy: context.requestedBy, resourceId: context.resourceId, path: context.path, networkOrigin: context.networkOrigin, signal: context.signal });
    if (result.success) return { ok: true, output: result.data, validation: result.validation === 'PASSED' ? 'PASSED' : 'NOT_REQUIRED' };
    return { ok: false, code: classifyLegacyFailure(result.error), message: result.error ?? `${toolId} failed` };
  };
}

export function serviceExecutor(gateway: SecureServiceGateway | undefined, serviceId: string): MioCapabilityExecutor {
  return async (input, context): Promise<MioCapabilityOutcome> => {
    if (!gateway?.has(serviceId)) return { ok: false, code: 'CAPABILITY_UNAVAILABLE', message: `${serviceId} has no service gateway in this runtime` };
    const { signal: _signal, requestId: _requestId, ...serviceContext } = context;
    const result = await gateway.execute(serviceId, input, serviceContext);
    if (result.success) return { ok: true, output: result.data, validation: result.validation === 'PASSED' ? 'PASSED' : 'NOT_REQUIRED' };
    return { ok: false, code: classifyLegacyFailure(result.error), message: result.error ?? `${serviceId} failed` };
  };
}

const nativeExecutors: Record<string, MioCapabilityExecutor<any, any>> = {
  'memory.recall': async (input: { limit?: number }, context) => {
    if (!context.projectId) return { ok: false, code: 'VALIDATION_FAILED', message: 'memory.recall requires a project' };
    await MemoryContextManager.ensureProjectInitialized(context.projectId);
    const items = MemoryContextManager.getProjectMemory(context.projectId)
      .filter((item) => item.projectId === context.projectId)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, input.limit ?? 20)
      .map((item) => ({ id: item.id, content: item.content.slice(0, 4000), trust: item.trust, layer: item.layer, updatedAt: item.updatedAt }));
    return { ok: true, output: { items }, validation: 'PASSED' };
  },
  'model.generate': async (input: { prompt: string; system?: string; maxOutputTokens?: number; temperature?: number }, context) => {
    const response = await ModelRouter.generate({
      messages: [...(input.system ? [{ role: 'system' as const, content: input.system }] : []), { role: 'user' as const, content: input.prompt }],
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      metadata: { taskId: context.taskId, ...(context.projectId ? { projectId: context.projectId } : {}) },
    });
    return { ok: true, output: { text: response.text, provider: response.provider, model: response.model, source: response.source }, validation: 'PASSED' };
  },
  'voice.speak': async (input: { text: string }, context) => {
    const stop = () => { void mioChatVoice.stop(); };
    context.signal.addEventListener('abort', stop, { once: true });
    try {
      await mioChatVoice.speak(input.text);
      return { ok: true, output: { spoken: !context.signal.aborted }, validation: 'PASSED' };
    } finally {
      context.signal.removeEventListener('abort', stop);
    }
  },
  'voice.stop': async () => {
    await mioChatVoice.stop();
    return { ok: true, output: { stopped: true }, validation: 'PASSED' };
  },
};

export interface DefaultCapabilityProtocolOptions {
  registry: CapabilityRegistry;
  toolRouter: ToolRouter;
  /** Desktop workspace gateway; when absent the FILES services stay declared but unavailable. */
  workspaceGateway?: SecureServiceGateway;
  /** Test seam: replaces native executors by capability id. */
  executors?: Partial<Record<string, MioCapabilityExecutor<any, any>>>;
}

export function createDefaultCapabilityProtocol(options: DefaultCapabilityProtocolOptions): CapabilityProtocol {
  const protocol = new CapabilityProtocol(options.registry);
  for (const [id, extras] of Object.entries(EXISTING_CAPABILITY_EXTRAS)) {
    const descriptor = options.registry.get(id);
    if (!descriptor) continue;
    const executor = options.executors?.[id] ?? (descriptor.kind === 'TOOL' ? toolExecutor(options.toolRouter, id) : serviceExecutor(options.workspaceGateway, id));
    protocol.declare({ ...descriptor, manifestVersion: MIO_CAPABILITY_MANIFEST_VERSION, ...extras }, executor);
  }
  for (const manifest of NEW_CAPABILITY_MANIFESTS) {
    const executor = options.executors?.[manifest.id] ?? nativeExecutors[manifest.id];
    protocol.declare(manifest, executor);
  }
  return protocol;
}
