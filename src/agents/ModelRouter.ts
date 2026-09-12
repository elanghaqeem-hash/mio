import { NetworkState } from '../types/core';

export interface ModelProviderConfig {
  provider: 'local_heuristic' | 'gemini' | 'claude' | 'openai' | 'ollama';
  apiKey?: string;
  endpoint?: string;
}

export class ModelRouter {
  private static networkState: NetworkState = 'OFFLINE';
  private static config: ModelProviderConfig = {
    provider: 'local_heuristic',
  };

  public static setNetworkState(state: NetworkState) {
    this.networkState = state;
  }

  public static getNetworkState(): NetworkState {
    return this.networkState;
  }

  public static configure(config: Partial<ModelProviderConfig>) {
    this.config = { ...this.config, ...config };
  }

  public static getConfig(): ModelProviderConfig {
    return { ...this.config };
  }

  public static isOffline(): boolean {
    return this.networkState === 'OFFLINE' || this.config.provider === 'local_heuristic';
  }
}
