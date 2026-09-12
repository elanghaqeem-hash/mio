import { eventBus } from '../core/EventBus';
import { taskRuntime } from './TaskRuntime';
import type { ResourceOperation, ResourceUsageEvent, TaskResourceBudget, TaskResourceState } from '../types/resources';

const DEFAULT_BUDGET: TaskResourceBudget = {
  maxDurationMs: 120_000,
  maxToolCalls: 8,
  maxNetworkCalls: 6,
  maxModelCalls: 4,
};

export class ResourceGovernor {
  private readonly states = new Map<string, TaskResourceState>();

  public ensure(taskId: string, override?: Partial<TaskResourceBudget>): TaskResourceState {
    const existing = this.states.get(taskId);
    if (existing) return this.clone(existing);
    const runtimeTask = taskRuntime.get(taskId);
    const startedAt = runtimeTask?.startedAt ?? runtimeTask?.createdAt ?? Date.now();
    const state: TaskResourceState = {
      taskId,
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
    this.publish(taskId, 'SCHEDULER_DISPATCH');
    return this.clone(current);
  }

  public assertCanDispatch(taskId: string): void {
    const state = this.getMutable(taskId);
    this.evaluate(state);
    if (state.exhausted) throw new Error(`Resource budget exhausted: ${state.exhaustedReason}`);
    this.publish(taskId, 'SCHEDULER_DISPATCH');
  }

  public consumeToolCall(taskId: string, networkAccess: boolean): TaskResourceState {
    const state = this.getMutable(taskId);
    this.evaluate(state);
    if (state.exhausted) throw new Error(`Resource budget exhausted: ${state.exhaustedReason}`);
    if (state.usage.toolCalls + 1 > state.budget.maxToolCalls) return this.exhaust(state, `tool call limit ${state.budget.maxToolCalls} reached`);
    if (networkAccess && state.usage.networkCalls + 1 > state.budget.maxNetworkCalls) return this.exhaust(state, `network call limit ${state.budget.maxNetworkCalls} reached`);
    state.usage.toolCalls += 1;
    if (networkAccess) state.usage.networkCalls += 1;
    state.usage.lastUpdatedAt = Date.now();
    this.publish(taskId, networkAccess ? 'NETWORK_CALL' : 'TOOL_CALL');
    return this.clone(state);
  }

  public consumeModelCall(taskId: string, networkAccess: boolean): TaskResourceState {
    const state = this.getMutable(taskId);
    this.evaluate(state);
    if (state.exhausted) throw new Error(`Resource budget exhausted: ${state.exhaustedReason}`);
    if (state.usage.modelCalls + 1 > state.budget.maxModelCalls) return this.exhaust(state, `model call limit ${state.budget.maxModelCalls} reached`);
    if (networkAccess && state.usage.networkCalls + 1 > state.budget.maxNetworkCalls) return this.exhaust(state, `network call limit ${state.budget.maxNetworkCalls} reached`);
    state.usage.modelCalls += 1;
    if (networkAccess) state.usage.networkCalls += 1;
    state.usage.lastUpdatedAt = Date.now();
    this.publish(taskId, networkAccess ? 'NETWORK_CALL' : 'MODEL_CALL');
    return this.clone(state);
  }

  public get(taskId: string): TaskResourceState | undefined {
    const state = this.states.get(taskId);
    return state ? this.clone(state) : undefined;
  }

  public clear(taskId: string): void { this.states.delete(taskId); }

  private getMutable(taskId: string): TaskResourceState {
    if (!this.states.has(taskId)) this.ensure(taskId);
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

  private exhaust(state: TaskResourceState, reason: string): never {
    state.exhausted = true;
    state.exhaustedReason = reason;
    state.usage.lastUpdatedAt = Date.now();
    this.publish(state.taskId, 'SCHEDULER_DISPATCH');
    throw new Error(`Resource budget exhausted: ${reason}`);
  }

  private publish(taskId: string, operation: ResourceOperation): void {
    const state = this.states.get(taskId);
    if (!state) return;
    const event: ResourceUsageEvent = { taskId, operation, timestamp: Date.now(), state: this.clone(state) };
    eventBus.emit<ResourceUsageEvent>('RESOURCE_USAGE', event);
    if (state.exhausted) {
      eventBus.emit('ACTIVITY_LOG', { timestamp: event.timestamp, message: `Task ${taskId}: RESOURCE_BUDGET_EXHAUSTED — ${state.exhaustedReason}`, mode: 'PROJECT' });
    }
  }

  private clone(state: TaskResourceState): TaskResourceState {
    return { ...state, budget: { ...state.budget }, usage: { ...state.usage } };
  }
}

export const resourceGovernor = new ResourceGovernor();
