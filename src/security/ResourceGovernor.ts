import { eventBus } from '../core/EventBus';
import type { MioSystemMode } from '../types/core';
import type { ResourceOperation, ResourceUsageEvent, TaskResourceBudget, TaskResourceState } from '../types/resources';

const DEFAULT_BUDGETS: Record<MioSystemMode, TaskResourceBudget> = {
  CHAT: { maxDurationMs: 60_000, maxToolCalls: 2, maxNetworkCalls: 3, maxModelCalls: 3 },
  RESEARCH: { maxDurationMs: 90_000, maxToolCalls: 3, maxNetworkCalls: 8, maxModelCalls: 2 },
  PROJECT: { maxDurationMs: 45_000, maxToolCalls: 5, maxNetworkCalls: 2, maxModelCalls: 2 },
  FILES: { maxDurationMs: 45_000, maxToolCalls: 8, maxNetworkCalls: 1, maxModelCalls: 1 },
  MOTION: { maxDurationMs: 60_000, maxToolCalls: 4, maxNetworkCalls: 1, maxModelCalls: 1 },
  ANIMATION: { maxDurationMs: 120_000, maxToolCalls: 8, maxNetworkCalls: 2, maxModelCalls: 3 },
  MOTION_2D: { maxDurationMs: 120_000, maxToolCalls: 8, maxNetworkCalls: 2, maxModelCalls: 3 },
  '3D': { maxDurationMs: 120_000, maxToolCalls: 8, maxNetworkCalls: 2, maxModelCalls: 3 },
  GRAPHIC: { maxDurationMs: 120_000, maxToolCalls: 8, maxNetworkCalls: 2, maxModelCalls: 3 },
  DRAWING: { maxDurationMs: 120_000, maxToolCalls: 8, maxNetworkCalls: 2, maxModelCalls: 3 },
  PHOTO: { maxDurationMs: 120_000, maxToolCalls: 8, maxNetworkCalls: 2, maxModelCalls: 3 },
  SFX: { maxDurationMs: 120_000, maxToolCalls: 8, maxNetworkCalls: 2, maxModelCalls: 3 },
  MUSIC: { maxDurationMs: 120_000, maxToolCalls: 8, maxNetworkCalls: 2, maxModelCalls: 3 },
  SECURITY: { maxDurationMs: 45_000, maxToolCalls: 4, maxNetworkCalls: 1, maxModelCalls: 1 },
  SETTINGS: { maxDurationMs: 30_000, maxToolCalls: 2, maxNetworkCalls: 1, maxModelCalls: 1 },
  TASKS: { maxDurationMs: 30_000, maxToolCalls: 2, maxNetworkCalls: 1, maxModelCalls: 1 },
};

export class ResourceGovernorController {
  private readonly states = new Map<string, TaskResourceState>();

  public registerTask(taskId: string, mode: MioSystemMode, override?: Partial<TaskResourceBudget>): TaskResourceState {
    const existing = this.states.get(taskId);
    if (existing) return this.clone(existing);
    const budget = { ...DEFAULT_BUDGETS[mode], ...override };
    const now = Date.now();
    const state: TaskResourceState = {
      taskId, mode, budget,
      usage: { toolCalls: 0, networkCalls: 0, modelCalls: 0, startedAt: now, lastUpdatedAt: now },
      exhausted: false,
    };
    this.states.set(taskId, state);
    this.emit(taskId, 'SCHEDULER_DISPATCH', 'ALLOW', 'Resource budget registered');
    return this.clone(state);
  }

  public ensureTask(taskId: string, mode: MioSystemMode = 'CHAT'): TaskResourceState {
    return this.states.has(taskId) ? this.clone(this.states.get(taskId)!) : this.registerTask(taskId, mode);
  }

  public authorize(taskId: string, operation: ResourceOperation, mode?: MioSystemMode): { allowed: boolean; reason?: string; state: TaskResourceState } {
    const state = this.states.get(taskId) ?? this.registerTask(taskId, mode ?? 'CHAT');
    const reason = this.exhaustionReason(state, operation);
    if (reason) return this.block(state, operation, reason);
    this.emit(taskId, operation, 'ALLOW');
    return { allowed: true, state: this.clone(state) };
  }

  public consume(taskId: string, operation: Exclude<ResourceOperation, 'SCHEDULER_DISPATCH'>, mode?: MioSystemMode): { allowed: boolean; reason?: string; state: TaskResourceState } {
    const decision = this.authorize(taskId, operation, mode);
    if (!decision.allowed) return decision;
    const state = this.states.get(taskId)!;
    if (operation === 'TOOL_CALL') state.usage.toolCalls += 1;
    if (operation === 'NETWORK_CALL') state.usage.networkCalls += 1;
    if (operation === 'MODEL_CALL') state.usage.modelCalls += 1;
    state.usage.lastUpdatedAt = Date.now();
    this.emit(taskId, operation, 'ALLOW', 'Resource usage consumed');
    return { allowed: true, state: this.clone(state) };
  }

  public consumeToolCall(taskId: string, networkAccess: boolean, mode?: MioSystemMode): { allowed: boolean; reason?: string; state: TaskResourceState } {
    const state = this.states.get(taskId) ?? this.registerTask(taskId, mode ?? 'CHAT');
    const durationReason = this.exhaustionReason(state, 'SCHEDULER_DISPATCH');
    const toolReason = state.usage.toolCalls >= state.budget.maxToolCalls ? `Tool-call budget exhausted (${state.usage.toolCalls}/${state.budget.maxToolCalls})` : undefined;
    const networkReason = networkAccess && state.usage.networkCalls >= state.budget.maxNetworkCalls ? `Network-call budget exhausted (${state.usage.networkCalls}/${state.budget.maxNetworkCalls})` : undefined;
    const reason = durationReason ?? toolReason ?? networkReason;
    if (reason) return this.block(state, networkReason ? 'NETWORK_CALL' : 'TOOL_CALL', reason);
    state.usage.toolCalls += 1;
    if (networkAccess) state.usage.networkCalls += 1;
    state.usage.lastUpdatedAt = Date.now();
    this.emit(taskId, 'TOOL_CALL', 'ALLOW', 'Tool-call resource usage consumed');
    if (networkAccess) this.emit(taskId, 'NETWORK_CALL', 'ALLOW', 'Network-call resource usage consumed');
    return { allowed: true, state: this.clone(state) };
  }

  public consumeModelCall(taskId: string, networkAccess: boolean, mode?: MioSystemMode): { allowed: boolean; reason?: string; state: TaskResourceState } {
    const state = this.states.get(taskId) ?? this.registerTask(taskId, mode ?? 'CHAT');
    const durationReason = this.exhaustionReason(state, 'SCHEDULER_DISPATCH');
    const modelReason = state.usage.modelCalls >= state.budget.maxModelCalls ? `Model-call budget exhausted (${state.usage.modelCalls}/${state.budget.maxModelCalls})` : undefined;
    const networkReason = networkAccess && state.usage.networkCalls >= state.budget.maxNetworkCalls ? `Network-call budget exhausted (${state.usage.networkCalls}/${state.budget.maxNetworkCalls})` : undefined;
    const reason = durationReason ?? modelReason ?? networkReason;
    if (reason) return this.block(state, networkReason ? 'NETWORK_CALL' : 'MODEL_CALL', reason);
    state.usage.modelCalls += 1;
    if (networkAccess) state.usage.networkCalls += 1;
    state.usage.lastUpdatedAt = Date.now();
    this.emit(taskId, 'MODEL_CALL', 'ALLOW', 'Model-call resource usage consumed');
    if (networkAccess) this.emit(taskId, 'NETWORK_CALL', 'ALLOW', 'Network-call resource usage consumed');
    return { allowed: true, state: this.clone(state) };
  }

  public get(taskId: string): TaskResourceState | undefined {
    const state = this.states.get(taskId); return state ? this.clone(state) : undefined;
  }

  public resetTask(taskId: string): void {
    const state = this.states.get(taskId);
    if (!state) return;
    this.states.delete(taskId);
    this.registerTask(taskId, state.mode ?? 'CHAT', state.budget);
  }

  public clearTask(taskId: string): void { this.states.delete(taskId); }

  private exhaustionReason(state: TaskResourceState, operation: ResourceOperation): string | undefined {
    const elapsed = Date.now() - state.usage.startedAt;
    if (elapsed > state.budget.maxDurationMs) return `Task duration budget exhausted (${elapsed}ms > ${state.budget.maxDurationMs}ms)`;
    if (operation === 'TOOL_CALL' && state.usage.toolCalls >= state.budget.maxToolCalls) return `Tool-call budget exhausted (${state.usage.toolCalls}/${state.budget.maxToolCalls})`;
    if (operation === 'NETWORK_CALL' && state.usage.networkCalls >= state.budget.maxNetworkCalls) return `Network-call budget exhausted (${state.usage.networkCalls}/${state.budget.maxNetworkCalls})`;
    if (operation === 'MODEL_CALL' && state.usage.modelCalls >= state.budget.maxModelCalls) return `Model-call budget exhausted (${state.usage.modelCalls}/${state.budget.maxModelCalls})`;
    return undefined;
  }

  private block(state: TaskResourceState, operation: ResourceOperation, reason: string): { allowed: false; reason: string; state: TaskResourceState } {
    state.exhausted = true; state.exhaustedReason = reason; state.usage.lastUpdatedAt = Date.now();
    this.emit(state.taskId, operation, 'BLOCK', reason);
    return { allowed: false, reason, state: this.clone(state) };
  }

  private emit(taskId: string, operation: ResourceOperation, decision: ResourceUsageEvent['decision'], reason?: string): void {
    const state = this.states.get(taskId);
    if (!state) return;
    eventBus.emit<ResourceUsageEvent>('RESOURCE_USAGE_EVENT', { taskId, operation, decision, timestamp: Date.now(), reason, state: this.clone(state) });
  }

  private clone(state: TaskResourceState): TaskResourceState {
    return { ...state, budget: { ...state.budget }, usage: { ...state.usage } };
  }
}

export const resourceGovernor = new ResourceGovernorController();
