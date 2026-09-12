import { eventBus } from '../core/EventBus';
import { LocalHeuristicProvider } from '../intelligence/model/LocalHeuristicProvider';
import { OllamaProvider } from '../intelligence/model/OllamaProvider';
import { SecureProxyModelProvider } from '../intelligence/model/SecureProxyModelProvider';
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

  public static setNetworkState(state: NetworkState) {
    this.networkState = state;
  }

  public static getNetworkState(): NetworkState {
    return this.networkState;
  }

  public static configure(config: Partial<ModelRouterConfig>) {
    this.config = { ...this.config, ...config };
  }

  public static getConfig(): ModelRouterConfig {
    return { ...this.config };
  }

  public static isOffline(): boolean {
    return this.networkState === 'OFFLINE' || this.config.provider === 'local_heuristic';
  }

  public static async generate(request: ModelRequest, timeoutMs: number = 30000): Promise<ModelResponse> {
    const provider = this.createProvider();

    if (provider.requiresNetwork && this.networkState !== 'ONLINE') {
      if (!this.config.allowOfflineFallback) {
        throw new Error(`Model provider '${provider.id}' requires ONLINE mode`);
      }
      return this.executeProvider(new LocalHeuristicProvider(), request, timeoutMs);
    }

    try {
      return await this.executeProvider(provider, request, timeoutMs);
    } catch (error) {
      if (!this.config.allowOfflineFallback || provider.id === 'local_heuristic') throw error;
      eventBus.emit('ACTIVITY_LOG', {
        timestamp: Date.now(),
        message: `Model provider ${provider.id} unavailable; using explicit offline fallback`,
        mode: 'CHAT',
      });
      return this.executeProvider(new LocalHeuristicProvider(), request, Math.min(timeoutMs, 5000));
    }
  }

  private static createProvider(): ModelProvider {
    const config = this.config;
    if (config.provider === 'local_heuristic') return new LocalHeuristicProvider();
    if (config.provider === 'ollama') return new OllamaProvider(config.ollamaEndpoint, config.model);

    return new SecureProxyModelProvider({
      provider: config.provider,
      endpoint: config.proxyEndpoint ?? '/api/ai/generate',
      model: config.model,
    });
  }

  private static async executeProvider(provider: ModelProvider, request: ModelRequest, timeoutMs: number): Promise<ModelResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    eventBus.emit('CORE_STATE_CHANGE', 'PROCESSING');

    try {
      const result = await provider.generate(request, controller.signal);
      if (!result.text.trim()) throw new Error(`Model provider '${provider.id}' returned empty text`);
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Model provider '${provider.id}' timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
