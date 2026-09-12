import { eventBus } from '../core/EventBus';
import { LocalHeuristicProvider } from '../intelligence/model/LocalHeuristicProvider';
import { OllamaProvider } from '../intelligence/model/OllamaProvider';
import { SecureProxyModelProvider } from '../intelligence/model/SecureProxyModelProvider';
import { taskRuntime } from '../orchestrator/TaskRuntime';
import { PermissionEngine } from '../security/PermissionEngine';
import { resourceGovernor } from '../security/ResourceGovernor';
import { NetworkState } from '../types/core';
import { ModelProvider, ModelRequest, ModelResponse, ModelRouterConfig } from '../types/models';

export class ModelRouter {
  private static networkState: NetworkState = 'OFFLINE';
  private static config: ModelRouterConfig = {
    provider: 'local_heuristic',
    proxyEndpoint: '/api/ai/generate',
    ollamaEndpoint: 'http://127.0.0.1:11434',
    allowOfflineFallback: true,
  };

  public static setNetworkState(state: NetworkState) { this.networkState = state; }
  public static getNetworkState(): NetworkState { return this.networkState; }
  public static configure(config: Partial<ModelRouterConfig>) { this.config = { ...this.config, ...config }; }
  public static getConfig(): ModelRouterConfig { return { ...this.config }; }
  public static isOffline(): boolean { return this.networkState === 'OFFLINE' || this.config.provider === 'local_heuristic'; }

  public static async generate(request: ModelRequest, timeoutMs: number = 30000): Promise<ModelResponse> {
    const provider = this.createProvider();
    const taskId = typeof request.metadata?.taskId === 'string' ? request.metadata.taskId : undefined;
    const mode = taskId ? taskRuntime.get(taskId)?.mode : undefined;

    if (taskId && taskRuntime.isCancelled(taskId)) throw new Error('Model request cancelled before execution');

    if (taskId) {
      const modelPreflight = resourceGovernor.authorize(taskId, 'MODEL_CALL', mode);
      if (!modelPreflight.allowed) throw new Error(modelPreflight.reason ?? 'Resource budget blocked model execution');
    }

    if (provider.requiresNetwork && this.networkState !== 'ONLINE') {
      if (!this.config.allowOfflineFallback) throw new Error(`Model provider '${provider.id}' requires ONLINE mode`);
      if (taskId) {
        const localDecision = resourceGovernor.consumeModelCall(taskId, false, mode);
        if (!localDecision.allowed) throw new Error(localDecision.reason ?? 'Resource budget blocked local model fallback');
      }
      return this.executeProvider(new LocalHeuristicProvider(), request, timeoutMs);
    }

    const remoteAccess = provider.requiresNetwork || provider.requiresProxy;
    if (taskId && remoteAccess) {
      const networkPreflight = resourceGovernor.authorize(taskId, 'NETWORK_CALL', mode);
      if (!networkPreflight.allowed) throw new Error(networkPreflight.reason ?? 'Resource budget blocked remote model access');
    }

    if (remoteAccess) {
      eventBus.emit('CORE_STATE_CHANGE', 'WAITING_PERMISSION');
      if (taskId) taskRuntime.waitForPermission(taskId);
      const approved = await PermissionEngine.requestPermission({
        action: `MODEL_PROVIDER:${provider.id}`,
        target: 'MIO AI Inference',
        level: 'L4_EXECUTE',
        changes: ['Send the current AI request to the configured remote model provider through the MIO secure proxy'],
        risks: ['Prompt content leaves the local browser and is processed by an external AI provider'],
        expectedResult: `Generate a response using ${provider.displayName}`,
      });
      if (!approved) throw new Error('Remote model execution permission denied');
      if (taskId && !taskRuntime.isCancelled(taskId)) taskRuntime.start(taskId);
    }

    if (taskId && taskRuntime.isCancelled(taskId)) throw new Error('Model request cancelled before execution');
    if (taskId) {
      const resourceDecision = resourceGovernor.consumeModelCall(taskId, remoteAccess, mode);
      if (!resourceDecision.allowed) throw new Error(resourceDecision.reason ?? 'Resource budget blocked model execution');
    }

    try {
      return await this.executeProvider(provider, request, timeoutMs);
    } catch (error) {
      if (taskId && taskRuntime.isCancelled(taskId)) throw new Error('Model request cancelled');
      if (!this.config.allowOfflineFallback || provider.id === 'local_heuristic') throw error;
      eventBus.emit('ACTIVITY_LOG', {
        timestamp: Date.now(),
        message: `Model provider ${provider.id} unavailable; using explicit offline fallback`,
        mode: 'CHAT',
      });
      if (taskId) {
        const fallbackDecision = resourceGovernor.consumeModelCall(taskId, false, mode);
        if (!fallbackDecision.allowed) throw new Error(fallbackDecision.reason ?? 'Resource budget blocked local model fallback');
      }
      return this.executeProvider(new LocalHeuristicProvider(), request, Math.min(timeoutMs, 5000));
    }
  }

  private static createProvider(): ModelProvider {
    const config = this.config;
    if (config.provider === 'local_heuristic') return new LocalHeuristicProvider();
    if (config.provider === 'ollama') return new OllamaProvider(config.ollamaEndpoint, config.model);
    return new SecureProxyModelProvider({ provider: config.provider, endpoint: config.proxyEndpoint ?? '/api/ai/generate', model: config.model });
  }

  private static async executeProvider(provider: ModelProvider, request: ModelRequest, timeoutMs: number): Promise<ModelResponse> {
    const controller = new AbortController();
    const taskId = typeof request.metadata?.taskId === 'string' ? request.metadata.taskId : undefined;
    const unregisterCancellation = taskId
      ? taskRuntime.registerCancellationHandler(taskId, () => controller.abort())
      : () => undefined;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    eventBus.emit('CORE_STATE_CHANGE', 'PROCESSING');

    try {
      const result = await provider.generate(request, controller.signal);
      if (controller.signal.aborted) throw new Error(taskId && taskRuntime.isCancelled(taskId) ? 'Model request cancelled' : `Model provider '${provider.id}' timed out after ${timeoutMs}ms`);
      if (!result.text.trim()) throw new Error(`Model provider '${provider.id}' returned empty text`);
      return result;
    } catch (error) {
      if (controller.signal.aborted) {
        if (taskId && taskRuntime.isCancelled(taskId)) throw new Error('Model request cancelled');
        throw new Error(`Model provider '${provider.id}' timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      unregisterCancellation();
    }
  }
}
