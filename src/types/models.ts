export type ModelProviderId = 'local_heuristic' | 'openai' | 'gemini' | 'claude' | 'ollama';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ApplicationContextTrust = 'VERIFIED' | 'QUARANTINED';
export type ApplicationContextFreshness = 'CURRENT' | 'STALE' | 'UNKNOWN';

export interface ApplicationContextSource {
  id: string;
  assetId: string;
  label: string;
  sourceUri: string;
  trust: ApplicationContextTrust;
  freshness?: ApplicationContextFreshness;
  reviewedAt?: number;
  score: number;
  text: string;
}

export interface ApplicationContextEnvelope {
  kind: 'PROJECT_KNOWLEDGE';
  policy: 'DATA_ONLY';
  projectId: string;
  contextBudgetChars: number;
  sources: ApplicationContextSource[];
}

export interface ModelRequest {
  messages: ModelMessage[];
  applicationContext?: ApplicationContextEnvelope;
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
