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
    if (!descriptor) return this.deny(capabilityId, 'Capability is not registered in the MIO manifest');
    if (descriptor.availability !== 'AVAILABLE') return this.deny(capabilityId, 'Capability is declared unavailable in this runtime', descriptor);
    if (!descriptor.modes.includes(context.mode)) return this.deny(capabilityId, `Capability is not authorized in ${context.mode} mode`, descriptor);
    if (descriptor.scopeFields.includes('TASK') && !context.taskId) return this.deny(capabilityId, 'Task scope is required', descriptor);
    if (descriptor.scopeFields.includes('PROJECT') && !context.projectId) return this.deny(capabilityId, 'Project scope is required', descriptor);
    if (descriptor.scopeFields.includes('RESOURCE') && !context.resourceId) return this.deny(capabilityId, 'Resource scope is required', descriptor);
    if (descriptor.scopeFields.includes('PATH') && !context.path) return this.deny(capabilityId, 'Path scope is required', descriptor);
    if (descriptor.scopeFields.includes('NETWORK_ORIGIN') && !context.networkOrigin) return this.deny(capabilityId, 'Network-origin scope is required', descriptor);
    if (descriptor.networkAccess && !context.networkOrigin) return this.deny(capabilityId, 'Network capability requires an explicit network origin', descriptor);

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

  private deny(capabilityId: string, reason: string, descriptor?: CapabilityDescriptor): CapabilityDecision {
    const decision: CapabilityDecision = { allowed: false, capabilityId, reason, descriptor: descriptor ? this.clone(descriptor) : undefined };
    eventBus.emit('CAPABILITY_DECISION', { ...decision, timestamp: Date.now() });
    return decision;
  }

  private publish(): void {
    eventBus.emit<CapabilitySnapshot>('CAPABILITY_REGISTRY_UPDATED', this.snapshot());
  }

  private clone(descriptor: CapabilityDescriptor): CapabilityDescriptor {
    return { ...descriptor, modes: [...descriptor.modes], scopeFields: [...descriptor.scopeFields] };
  }
}

export function createDefaultCapabilityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
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
    scopeFields: ['TASK', 'PROJECT', 'TOOL', 'NETWORK_ORIGIN'],
    timeoutMs: 20000,
  });
  registry.register({
    id: 'service.filesystem',
    kind: 'SERVICE',
    description: 'Privileged filesystem service gateway. No web-lab handler is registered in TP 0.11.',
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
    description: 'Privileged operating-system integration gateway. Not available in the web runtime.',
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

export const defaultCapabilityRegistry = createDefaultCapabilityRegistry();
