import { NetworkState } from '../types/core';

export interface ModelProviderConfig {
  provider: 'local_heuristic' | 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'claude_cli' | 'gemini_cli' | 'ollama_cli';
}

export class ModelRouter {
  private static networkState: NetworkState = 'OFFLINE';
  private static config: ModelProviderConfig = { provider: 'local_heuristic' };

  public static setNetworkState(state: NetworkState) { this.networkState = state; }
  public static getNetworkState(): NetworkState { return this.networkState; }
  public static configure(config: Partial<ModelProviderConfig>) { this.config = { ...this.config, ...config }; }
  public static getConfig(): ModelProviderConfig { return { ...this.config }; }
  public static isOffline(): boolean { return this.networkState === 'OFFLINE' || this.config.provider === 'local_heuristic'; }

  public static async getAvailableProviders(): Promise<any[]> {
    if (!window.mioDesktop) return [];
    return window.mioDesktop.listProviders();
  }

  public static async selectDefaultProvider(): Promise<string> {
    if (this.networkState === 'OFFLINE' || !window.mioDesktop) return 'local_heuristic';
    const preferred = await window.mioDesktop.getSetting('ai.defaultProvider', '');
    const providers = await window.mioDesktop.listProviders();
    const connected = providers.filter((p: any) => p.enabled && p.lastStatus === 'connected');
    const chosen = connected.find((p: any) => p.provider === preferred) || connected[0];
    return chosen?.provider || 'local_heuristic';
  }

  public static async generate(prompt: string): Promise<{ success: boolean; text: string; provider: string; error?: string }> {
    const provider = await this.selectDefaultProvider();
    if (provider === 'local_heuristic') {
      return { success: true, provider, text: 'No verified external AI provider is active. Configure and test an API or CLI provider in Settings, or continue with MIO native procedural tools.' };
    }
    const result = await window.mioDesktop!.generateWithProvider(provider, prompt);
    return { success: Boolean(result.success), provider, text: result.text || '', error: result.error };
  }
}
