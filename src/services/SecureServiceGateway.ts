import { eventBus } from '../core/EventBus';
import { defaultCapabilityRegistry, CapabilityRegistry } from '../security/CapabilityRegistry';
import { PermissionEngine } from '../security/PermissionEngine';
import { PolicyEngine } from '../security/PolicyEngine';
import { resourceGovernor } from '../security/ResourceGovernor';
import { Sandbox } from '../security/Sandbox';
import { taskRuntime } from '../orchestrator/TaskRuntime';
import type { CapabilityExecutionContext } from '../types/capabilities';

export interface MioServiceDefinition<I = unknown, O = unknown> {
  id: string;
  validateInput: (input: unknown) => input is I;
  execute: (input: I, context: CapabilityExecutionContext & { signal: AbortSignal }) => Promise<O>;
  validateOutput?: (output: O) => boolean;
}

type RegisteredService = MioServiceDefinition<any, any>;

export interface ServiceGatewayResult<T = unknown> {
  success: boolean;
  serviceId: string;
  startedAt: number;
  completedAt: number;
  data?: T;
  error?: string;
  validation: 'PASSED' | 'FAILED' | 'NOT_REQUIRED';
}

export class SecureServiceGateway {
  private readonly services = new Map<string, RegisteredService>();

  constructor(private readonly capabilities: CapabilityRegistry = defaultCapabilityRegistry) {}

  public register<I, O>(service: MioServiceDefinition<I, O>): void {
    if (!service.id.trim()) throw new Error('Service id is required');
    if (this.services.has(service.id)) throw new Error(`Service '${service.id}' is already registered`);
    const descriptor = this.capabilities.get(service.id);
    if (!descriptor) throw new Error(`Service '${service.id}' has no capability manifest entry`);
    if (descriptor.kind !== 'SERVICE') throw new Error(`Capability '${service.id}' is not declared as SERVICE`);
    if (descriptor.availability !== 'AVAILABLE') throw new Error(`Service '${service.id}' is declared unavailable`);
    this.services.set(service.id, service);
  }

  public has(serviceId: string): boolean {
    return this.services.has(serviceId);
  }

  public async execute<T = unknown>(serviceId: string, input: unknown, context: CapabilityExecutionContext): Promise<ServiceGatewayResult<T>> {
    const startedAt = Date.now();
    const service = this.services.get(serviceId);
    if (!service) return this.fail(serviceId, startedAt, `Service '${serviceId}' is not registered in SecureServiceGateway`);

    const capability = this.capabilities.authorize(serviceId, context);
    if (!capability.allowed || !capability.descriptor) return this.fail(serviceId, startedAt, capability.reason ?? 'Capability manifest rejected service execution');
    const manifest = capability.descriptor;

    const policy = PolicyEngine.validateInstruction(`${serviceId} ${JSON.stringify(input)}`);
    if (!policy.allowed) return this.fail(serviceId, startedAt, policy.reason ?? 'Policy rejected service request');
    if (!service.validateInput(input)) return this.fail(serviceId, startedAt, 'Service input validation failed');
    if (taskRuntime.isCancelled(context.taskId)) return this.fail(serviceId, startedAt, 'Task cancelled before service execution');

    const serviceBudget = resourceGovernor.authorize(context.taskId, 'TOOL_CALL', context.mode);
    if (!serviceBudget.allowed) return this.fail(serviceId, startedAt, serviceBudget.reason ?? 'Resource budget blocked service execution');
    if (manifest.networkAccess) {
      const networkBudget = resourceGovernor.authorize(context.taskId, 'NETWORK_CALL', context.mode);
      if (!networkBudget.allowed) return this.fail(serviceId, startedAt, networkBudget.reason ?? 'Resource budget blocked service network access');
    }

    const target = context.projectId ?? 'Current Workspace';
    const requiredScope = {
      taskId: context.taskId,
      projectId: context.projectId,
      action: `SERVICE:${serviceId}`,
      target,
      resourceId: context.resourceId,
      path: context.path,
      networkOrigin: context.networkOrigin,
      networkAllowed: manifest.networkAccess,
    };

    if (manifest.permissionLevel === 'L4_EXECUTE' || manifest.permissionLevel === 'L5_DESTRUCTIVE') {
      eventBus.emit('CORE_STATE_CHANGE', 'WAITING_PERMISSION');
      taskRuntime.waitForPermission(context.taskId);
    }

    const grant = await PermissionEngine.requestScopedPermission({
      action: requiredScope.action,
      target,
      level: manifest.permissionLevel,
      changes: [`Execute service capability ${serviceId}`],
      risks: [`Manifest risk level: ${manifest.riskLevel}`, ...(manifest.networkAccess ? ['Service may access network resources'] : [])],
      expectedResult: manifest.description,
      taskId: context.taskId,
      projectId: context.projectId,
      resourceId: context.resourceId,
      path: context.path,
      networkAccess: manifest.networkAccess,
      networkOrigin: context.networkOrigin,
      ttlMs: Math.max(15_000, Math.min(manifest.timeoutMs + 10_000, 120_000)),
      maxUses: 1,
    });
    if (!grant || !PermissionEngine.validateGrant(grant.id, requiredScope)) return this.fail(serviceId, startedAt, 'Permission denied or service scope mismatch');

    const resourceDecision = resourceGovernor.consumeToolCall(context.taskId, manifest.networkAccess, context.mode);
    if (!resourceDecision.allowed) {
      PermissionEngine.revokeGrant(grant.id, 'Resource budget blocked service execution');
      return this.fail(serviceId, startedAt, resourceDecision.reason ?? 'Resource budget blocked service execution');
    }

    taskRuntime.start(context.taskId);
    const controller = new AbortController();
    const unregister = taskRuntime.registerCancellationHandler(context.taskId, () => controller.abort());

    try {
      const output = await Sandbox.executeGuarded(
        serviceId,
        async () => {
          if (!PermissionEngine.consumeGrant(grant.id, requiredScope)) throw new Error('Scoped service authorization expired, was revoked, or no longer matches execution scope');
          const runtimeCapability = this.capabilities.authorize(serviceId, context);
          if (!runtimeCapability.allowed) throw new Error(runtimeCapability.reason ?? 'Service capability became unavailable before execution');
          if (controller.signal.aborted) throw new Error('Service execution cancelled');
          const result = await service.execute(input, { ...context, signal: controller.signal }) as T;
          if (controller.signal.aborted) throw new Error('Service execution cancelled');
          return result;
        },
        manifest.timeoutMs,
      );

      const valid = service.validateOutput ? service.validateOutput(output) : true;
      if (!valid) return this.fail(serviceId, startedAt, 'Service output validation failed');
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Service capability ${serviceId} executed for task ${context.taskId}`, mode: context.mode });
      return { success: true, serviceId, startedAt, completedAt: Date.now(), data: output, validation: service.validateOutput ? 'PASSED' : 'NOT_REQUIRED' };
    } catch (error) {
      return this.fail(serviceId, startedAt, controller.signal.aborted ? 'Service execution cancelled' : error instanceof Error ? error.message : String(error));
    } finally {
      unregister();
    }
  }

  private fail(serviceId: string, startedAt: number, error: string): ServiceGatewayResult<never> {
    eventBus.emit('SECURITY_EVENT', {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level: 'blocked',
      category: 'TOOL_EXECUTION',
      action: `SERVICE:${serviceId}`,
      details: error,
      blocked: true,
    });
    return { success: false, serviceId, startedAt, completedAt: Date.now(), error, validation: 'FAILED' };
  }
}

export const secureServiceGateway = new SecureServiceGateway();
