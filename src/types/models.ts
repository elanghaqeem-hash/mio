export type ModelProviderId = 'local_heuristic' | 'openai' | 'gemini' | 'claude' | 'ollama';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelRequest {
  messages: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ModelResponse {
  provider: ModelProviderId;
  model: string;
  text: string;
  usage?: ModelUsage;
  finishReason?: string;
  generatedAt: number;
  source: 'LOCAL' | 'CLOUD_PROXY' | 'LOCAL_ENDPOINT';
}

export interface ModelProvider {
  readonly id: ModelProviderId;
  readonly displayName: string;
  readonly requiresNetwork: boolean;
  readonly requiresProxy: boolean;
  generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse>;
}

export interface ModelRouterConfig {
  provider: ModelProviderId;
  model?: string;
  proxyEndpoint?: string;
  ollamaEndpoint?: string;
  allowOfflineFallback: boolean;
}
