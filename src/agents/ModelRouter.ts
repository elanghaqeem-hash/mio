import { NetworkState } from '../types/core';

export interface ModelProviderConfig {
  provider: 'local_heuristic' | 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'claude_cli' | 'gemini_cli' | 'ollama_cli';
}

export class ModelRouter {
  private static networkState: NetworkState = 'OFFLINE';
  private static config: ModelProviderConfig = { provider: 'local_heuristic' };
  private static sessionVerifiedProviders = new Set<string>();

  public static setNetworkState(state: NetworkState) { this.networkState = state; }
  public static getNetworkState(): NetworkState { return this.networkState; }
  public static configure(config: Partial<ModelProviderConfig>) { this.config = { ...this.config, ...config }; }
  public static getConfig(): ModelProviderConfig { return { ...this.config }; }
  public static isOffline(): boolean { return this.networkState === 'OFFLINE' || this.config.provider === 'local_heuristic'; }
  public static markProviderVerified(provider: string) { this.sessionVerifiedProviders.add(provider); }
  public static markProviderFailed(provider: string) { this.sessionVerifiedProviders.delete(provider); }
  public static isProviderSessionVerified(provider: string) { return this.sessionVerifiedProviders.has(provider); }

  public static async getAvailableProviders(): Promise<any[]> {
    if (!window.mioDesktop) return [];
    const providers = await window.mioDesktop.listProviders();
    return providers.map((provider: any) => ({
      ...provider,
      lastStatus: provider.lastStatus === 'connected' || this.sessionVerifiedProviders.has(provider.provider) ? 'connected' : provider.lastStatus,
    }));
  }

  public static async selectDefaultProvider(): Promise<string> {
    if (this.networkState === 'OFFLINE' || !window.mioDesktop) return 'local_heuristic';
    const preferred = await window.mioDesktop.getSetting('ai.defaultProvider', '');
    let providers = await this.getAvailableProviders();
    let connected = providers.filter((p: any) => p.enabled && p.lastStatus === 'connected');
    let chosen = connected.find((p: any) => p.provider === preferred) || connected[0];
    if (chosen) return chosen.provider;

    const runtime = await window.mioDesktop.getSecurityStatus();
    if (runtime?.runtime === 'web') {
      const candidates = providers
        .filter((p: any) => p.enabled && p.hasSecret)
        .sort((a: any, b: any) => Number(b.provider === preferred) - Number(a.provider === preferred));
      for (const candidate of candidates) {
        const result = await window.mioDesktop.testProvider(candidate.provider);
        if (result?.success) {
          this.markProviderVerified(candidate.provider);
          await window.mioDesktop.setSetting('ai.defaultProvider', candidate.provider);
          return candidate.provider;
        }
        this.markProviderFailed(candidate.provider);
      }
      providers = await this.getAvailableProviders();
      connected = providers.filter((p: any) => p.enabled && p.lastStatus === 'connected');
      chosen = connected[0];
      if (chosen) return chosen.provider;
    }
    return 'local_heuristic';
  }

  public static async generate(prompt: string): Promise<{ success: boolean; text: string; provider: string; error?: string }> {
    const provider = await this.selectDefaultProvider();
    if (provider === 'local_heuristic') {
      return { success: true, provider, text: 'No verified external AI provider is active. Configure and test an API provider in Settings, or continue with MIO native procedural tools.' };
    }
    const result = await window.mioDesktop!.generateWithProvider(provider, prompt);
    if (!result.success) this.markProviderFailed(provider);
    return { success: Boolean(result.success), provider, text: result.text || '', error: result.error };
  }
}
