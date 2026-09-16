import { eventBus } from '../core/EventBus';
import type { CapabilityDecision, CapabilityDescriptor, CapabilityExecutionContext, CapabilitySnapshot } from '../types/capabilities';
import type { MioTool } from '../types/tools';

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, CapabilityDescriptor>();

  public register(descriptor: CapabilityDescriptor): void {
    if (!descriptor.id.trim()) throw new Error('Capability id is required');
    if (this.capabilities.has(descriptor.id)) throw new Error(`Capability '${descriptor.id}' is already registered`);
    if (!descriptor.modes.length) throw new Error(`Capability '${descriptor.id}' must declare at least one mode`);
    if (!Number.isFinite(descriptor.timeoutMs) || descriptor.timeoutMs <= 0) throw new Error(`Capability '${descriptor.id}' must declare a positive timeout`);
    this.capabilities.set(descriptor.id, this.clone(descriptor));
    this.publish();
  }

  public get(capabilityId: string): CapabilityDescriptor | undefined {
    const descriptor = this.capabilities.get(capabilityId);
    return descriptor ? this.clone(descriptor) : undefined;
  }

  public list(): CapabilityDescriptor[] {
    return [...this.capabilities.values()].map((descriptor) => this.clone(descriptor));
  }

  public snapshot(): CapabilitySnapshot {
    return { capabilities: this.list(), updatedAt: Date.now() };
  }

  public authorize(capabilityId: string, context: CapabilityExecutionContext): CapabilityDecision {
    const descriptor = this.capabilities.get(capabilityId);
    if (!descriptor) return this.deny(capabilityId, 'Capability is not registered in the MIO manifest', context);
    if (descriptor.availability !== 'AVAILABLE') return this.deny(capabilityId, 'Capability is declared unavailable in this runtime', context, descriptor);
    if (!descriptor.modes.includes(context.mode)) return this.deny(capabilityId, `Capability is not authorized in ${context.mode} mode`, context, descriptor);
    if (descriptor.scopeFields.includes('TASK') && !context.taskId) return this.deny(capabilityId, 'Task scope is required', context, descriptor);
    if (descriptor.scopeFields.includes('PROJECT') && !context.projectId) return this.deny(capabilityId, 'Project scope is required', context, descriptor);
    if (descriptor.scopeFields.includes('TOOL') && context.toolId !== capabilityId) return this.deny(capabilityId, 'Tool identity does not match the capability manifest', context, descriptor);
    if (descriptor.scopeFields.includes('RESOURCE') && !context.resourceId) return this.deny(capabilityId, 'Resource scope is required', context, descriptor);
    if (descriptor.scopeFields.includes('PATH') && !context.path) return this.deny(capabilityId, 'Path scope is required', context, descriptor);
    if (descriptor.scopeFields.includes('NETWORK_ORIGIN') && !context.networkOrigin) return this.deny(capabilityId, 'Network-origin scope is required', context, descriptor);

    const decision: CapabilityDecision = { allowed: true, capabilityId, descriptor: this.clone(descriptor) };
    eventBus.emit('CAPABILITY_DECISION', { ...decision, taskId: context.taskId, mode: context.mode, timestamp: Date.now() });
    return decision;
  }

  public assertToolContract(tool: MioTool<unknown, unknown>): void {
    const descriptor = this.capabilities.get(tool.id);
    if (!descriptor) throw new Error(`Tool '${tool.id}' has no capability manifest entry`);
    if (descriptor.kind !== 'TOOL') throw new Error(`Capability '${tool.id}' is not declared as TOOL`);
    if (descriptor.availability !== 'AVAILABLE') throw new Error(`Tool '${tool.id}' is declared unavailable`);
    if (descriptor.permissionLevel !== tool.permissionLevel) throw new Error(`Tool '${tool.id}' permission metadata differs from capability manifest`);
    if (descriptor.riskLevel !== tool.riskLevel) throw new Error(`Tool '${tool.id}' risk metadata differs from capability manifest`);
    if (descriptor.networkAccess !== (tool.networkAccess === true)) throw new Error(`Tool '${tool.id}' network metadata differs from capability manifest`);
    if (descriptor.timeoutMs !== tool.timeoutMs) throw new Error(`Tool '${tool.id}' timeout differs from capability manifest`);
    const toolModes = [...tool.modes].sort().join('|');
    const manifestModes = [...descriptor.modes].sort().join('|');
    if (toolModes !== manifestModes) throw new Error(`Tool '${tool.id}' mode metadata differs from capability manifest`);
  }

  private deny(capabilityId: string, reason: string, context?: CapabilityExecutionContext, descriptor?: CapabilityDescriptor): CapabilityDecision {
    const decision: CapabilityDecision = { allowed: false, capabilityId, reason, descriptor: descriptor ? this.clone(descriptor) : undefined };
    eventBus.emit('CAPABILITY_DECISION', { ...decision, taskId: context?.taskId, mode: context?.mode, timestamp: Date.now() });
    return decision;
  }

  private publish(): void {
    eventBus.emit<CapabilitySnapshot>('CAPABILITY_REGISTRY_UPDATED', this.snapshot());
  }

  private clone(descriptor: CapabilityDescriptor): CapabilityDescriptor {
    return { ...descriptor, modes: [...descriptor.modes], scopeFields: [...descriptor.scopeFields] };
  }
}

export interface CapabilityRegistryOptions {
  desktopWorkspaceBridge?: boolean;
}

export function createDefaultCapabilityRegistry(options: CapabilityRegistryOptions = {}): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registry.register({
    id: 'agent.orchestrator',
    kind: 'AGENT',
    description: 'Plan and coordinate MIO tasks within the active project while delegating privileged actions to bounded capabilities.',
    ownerLayer: 'AGENT',
    modes: ['CHAT', 'RESEARCH', 'FILES', 'MOTION', '3D', 'ANIMATION', 'GRAPHIC', 'DRAWING', 'PHOTO', 'SFX', 'MUSIC', 'PROJECT', 'TASKS', 'SETTINGS', 'SECURITY'],
    riskLevel: 'MODERATE',
    permissionLevel: 'L1_SUGGEST',
    availability: 'AVAILABLE',
    networkAccess: false,
    scopeFields: ['TASK', 'PROJECT'],
    timeoutMs: 120000,
  });
  registry.register({
    id: 'project.inspect',
    kind: 'TOOL',
    description: 'Read current project identity, active mode, and asset summary without modifying project state.',
    ownerLayer: 'ORCHESTRATOR',
    modes: ['CHAT', 'PROJECT'],
    riskLevel: 'LOW',
    permissionLevel: 'L1_SUGGEST',
    availability: 'AVAILABLE',
    networkAccess: false,
    scopeFields: ['TASK', 'PROJECT'],
    timeoutMs: 2000,
  });
  registry.register({
    id: 'research.search',
    kind: 'TOOL',
    description: 'Search configured external research providers and return sanitized, source-aware research results.',
    ownerLayer: 'ORCHESTRATOR',
    modes: ['CHAT', 'RESEARCH'],
    riskLevel: 'HIGH',
    permissionLevel: 'L4_EXECUTE',
    availability: 'AVAILABLE',
    networkAccess: true,
    scopeFields: ['TASK', 'PROJECT', 'TOOL'],
    timeoutMs: 20000,
  });

  const desktopAvailability = options.desktopWorkspaceBridge ? 'AVAILABLE' : 'UNAVAILABLE';
  registry.register({
    id: 'service.desktop.workspace.read-text',
    kind: 'SERVICE',
    description: 'Read bounded UTF-8 text from an explicitly user-authorized desktop workspace using workspaceId plus relative path.',
    ownerLayer: 'SERVICE',
    modes: ['FILES', 'PROJECT'],
    riskLevel: 'LOW',
    permissionLevel: 'L0_OBSERVE',
    availability: desktopAvailability,
    networkAccess: false,
    scopeFields: ['TASK', 'PROJECT', 'RESOURCE', 'PATH'],
    timeoutMs: 10000,
  });
  registry.register({
    id: 'service.desktop.workspace.list',
    kind: 'SERVICE',
    description: 'List a bounded directory inside an explicitly user-authorized desktop workspace using workspaceId plus relative path.',
    ownerLayer: 'SERVICE',
    modes: ['FILES', 'PROJECT'],
    riskLevel: 'LOW',
    permissionLevel: 'L0_OBSERVE',
    availability: desktopAvailability,
    networkAccess: false,
    scopeFields: ['TASK', 'PROJECT', 'RESOURCE', 'PATH'],
    timeoutMs: 10000,
  });
  registry.register({
    id: 'service.filesystem',
    kind: 'SERVICE',
    description: 'Generic unrestricted filesystem access is intentionally unavailable. Use bounded desktop workspace capabilities instead.',
    ownerLayer: 'SERVICE',
    modes: ['FILES', 'PROJECT'],
    riskLevel: 'HIGH',
    permissionLevel: 'L4_EXECUTE',
    availability: 'UNAVAILABLE',
    networkAccess: false,
    scopeFields: ['TASK', 'PROJECT', 'PATH'],
    timeoutMs: 15000,
  });
  registry.register({
    id: 'service.os',
    kind: 'SERVICE',
    description: 'Privileged operating-system integration gateway. Destructive/process authority remains unavailable in TP 0.12.',
    ownerLayer: 'SERVICE',
    modes: ['PROJECT', 'TASKS'],
    riskLevel: 'CRITICAL',
    permissionLevel: 'L5_DESTRUCTIVE',
    availability: 'UNAVAILABLE',
    networkAccess: false,
    scopeFields: ['TASK', 'PROJECT', 'RESOURCE'],
    timeoutMs: 15000,
  });
  return registry;
}

export function createDesktopCapabilityRegistry(): CapabilityRegistry {
  return createDefaultCapabilityRegistry({ desktopWorkspaceBridge: true });
}

export const defaultCapabilityRegistry = createDefaultCapabilityRegistry();
