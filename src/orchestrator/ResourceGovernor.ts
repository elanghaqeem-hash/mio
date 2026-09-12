import { eventBus } from '../core/EventBus';
import { taskRuntime } from './TaskRuntime';
import type { MioSystemMode } from '../types/core';
import type { ResourceOperation, ResourceUsageEvent, TaskResourceBudget, TaskResourceState } from '../types/resources';

const DEFAULT_BUDGET: TaskResourceBudget = {
  maxDurationMs: 120_000,
  maxToolCalls: 8,
  maxNetworkCalls: 6,
  maxModelCalls: 4,
};

export class ResourceGovernor {
  private readonly states = new Map<string, TaskResourceState>();

  public ensure(taskId: string, override?: Partial<TaskResourceBudget>, mode?: MioSystemMode): TaskResourceState {
    const existing = this.states.get(taskId);
    if (existing) return this.clone(existing);
    const runtimeTask = taskRuntime.get(taskId);
    const startedAt = runtimeTask?.startedAt ?? runtimeTask?.createdAt ?? Date.now();
    const state: TaskResourceState = {
      taskId,
      mode: mode ?? runtimeTask?.mode,
      budget: { ...DEFAULT_BUDGET, ...override },
      usage: { toolCalls: 0, networkCalls: 0, modelCalls: 0, startedAt, lastUpdatedAt: Date.now() },
      exhausted: false,
    };
    this.states.set(taskId, state);
    return this.clone(state);
  }

  public configure(taskId: string, override: Partial<TaskResourceBudget>): TaskResourceState {
    const current = this.getMutable(taskId);
    current.budget = { ...current.budget, ...override };
    current.usage.lastUpdatedAt = Date.now();
    this.evaluate(current);
    this.publish(taskId, 'SCHEDULER_DISPATCH', current.exhausted ? 'BLOCK' : 'ALLOW', current.exhaustedReason);
    return this.clone(current);
  }

  public authorize(taskId: string, operation: ResourceOperation, mode?: MioSystemMode): { allowed: boolean; reason?: string; state: TaskResourceState } {
    const state = this.getMutable(taskId, mode);
    this.evaluate(state);
    if (state.exhausted) {
      const reason = `Resource budget exhausted: ${state.exhaustedReason}`;
      this.publish(taskId, operation, 'BLOCK', reason);
      return { allowed: false, reason, state: this.clone(state) };
    }
    this.publish(taskId, operation, 'ALLOW');
    return { allowed: true, state: this.clone(state) };
  }

  public assertCanDispatch(taskId: string): void {
    const decision = this.authorize(taskId, 'SCHEDULER_DISPATCH');
    if (!decision.allowed) throw new Error(decision.reason);
  }

  public consumeToolCall(taskId: string, networkAccess: boolean): TaskResourceState {
    const state = this.getMutable(taskId);
    this.evaluate(state);
    if (state.exhausted) return this.exhaust(state, 'TOOL_CALL', state.exhaustedReason ?? 'resource budget exhausted');
    if (state.usage.toolCalls + 1 > state.budget.maxToolCalls) return this.exhaust(state, 'TOOL_CALL', `tool call limit ${state.budget.maxToolCalls} reached`);
    if (networkAccess && state.usage.networkCalls + 1 > state.budget.maxNetworkCalls) return this.exhaust(state, 'NETWORK_CALL', `network call limit ${state.budget.maxNetworkCalls} reached`);
    state.usage.toolCalls += 1;
    state.usage.lastUpdatedAt = Date.now();
    this.publish(taskId, 'TOOL_CALL', 'ALLOW');
    if (networkAccess) {
      state.usage.networkCalls += 1;
      state.usage.lastUpdatedAt = Date.now();
      this.publish(taskId, 'NETWORK_CALL', 'ALLOW');
    }
    return this.clone(state);
  }

  public consumeModelCall(taskId: string, networkAccess: boolean): TaskResourceState {
    const state = this.getMutable(taskId);
    this.evaluate(state);
    if (state.exhausted) return this.exhaust(state, 'MODEL_CALL', state.exhaustedReason ?? 'resource budget exhausted');
    if (state.usage.modelCalls + 1 > state.budget.maxModelCalls) return this.exhaust(state, 'MODEL_CALL', `model call limit ${state.budget.maxModelCalls} reached`);
    if (networkAccess && state.usage.networkCalls + 1 > state.budget.maxNetworkCalls) return this.exhaust(state, 'NETWORK_CALL', `network call limit ${state.budget.maxNetworkCalls} reached`);
    state.usage.modelCalls += 1;
    state.usage.lastUpdatedAt = Date.now();
    this.publish(taskId, 'MODEL_CALL', 'ALLOW');
    if (networkAccess) {
      state.usage.networkCalls += 1;
      state.usage.lastUpdatedAt = Date.now();
      this.publish(taskId, 'NETWORK_CALL', 'ALLOW');
    }
    return this.clone(state);
  }

  public consumeNetworkCall(taskId: string): TaskResourceState {
    const state = this.getMutable(taskId);
    this.evaluate(state);
    if (state.exhausted) return this.exhaust(state, 'NETWORK_CALL', state.exhaustedReason ?? 'resource budget exhausted');
    if (state.usage.networkCalls + 1 > state.budget.maxNetworkCalls) return this.exhaust(state, 'NETWORK_CALL', `network call limit ${state.budget.maxNetworkCalls} reached`);
    state.usage.networkCalls += 1;
    state.usage.lastUpdatedAt = Date.now();
    this.publish(taskId, 'NETWORK_CALL', 'ALLOW');
    return this.clone(state);
  }

  public get(taskId: string): TaskResourceState | undefined {
    const state = this.states.get(taskId);
    return state ? this.clone(state) : undefined;
  }

  public resetTask(taskId: string): void {
    const state = this.states.get(taskId);
    const budget = state?.budget;
    const mode = state?.mode;
    this.states.delete(taskId);
    this.ensure(taskId, budget, mode);
  }

  public clear(taskId: string): void { this.states.delete(taskId); }

  private getMutable(taskId: string, mode?: MioSystemMode): TaskResourceState {
    if (!this.states.has(taskId)) this.ensure(taskId, undefined, mode);
    return this.states.get(taskId)!;
  }

  private evaluate(state: TaskResourceState): void {
    if (state.exhausted) return;
    const elapsed = Date.now() - state.usage.startedAt;
    if (elapsed > state.budget.maxDurationMs) {
      state.exhausted = true;
      state.exhaustedReason = `duration limit ${state.budget.maxDurationMs}ms exceeded`;
      state.usage.lastUpdatedAt = Date.now();
    }
  }

  private exhaust(state: TaskResourceState, operation: ResourceOperation, reason: string): never {
    state.exhausted = true;
    state.exhaustedReason = reason;
    state.usage.lastUpdatedAt = Date.now();
    this.publish(state.taskId, operation, 'BLOCK', `Resource budget exhausted: ${reason}`);
    throw new Error(`Resource budget exhausted: ${reason}`);
  }

  private publish(taskId: string, operation: ResourceOperation, decision: ResourceUsageEvent['decision'], reason?: string): void {
    const state = this.states.get(taskId);
    if (!state) return;
    const event: ResourceUsageEvent = { taskId, operation, decision, reason, timestamp: Date.now(), state: this.clone(state) };
    eventBus.emit<ResourceUsageEvent>('RESOURCE_USAGE', event);
    if (decision === 'BLOCK') {
      eventBus.emit('ACTIVITY_LOG', { timestamp: event.timestamp, message: `Task ${taskId}: RESOURCE_BUDGET_BLOCK — ${reason ?? state.exhaustedReason ?? 'blocked'}`, mode: 'PROJECT' });
    }
  }

  private clone(state: TaskResourceState): TaskResourceState {
    return { ...state, budget: { ...state.budget }, usage: { ...state.usage } };
  }
}

export const resourceGovernor = new ResourceGovernor();
