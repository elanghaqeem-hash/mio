import { ModelProvider, ModelProviderId, ModelRequest, ModelResponse } from '../../types/models';

interface ProxyProviderOptions {
  provider: Exclude<ModelProviderId, 'local_heuristic' | 'ollama'>;
  endpoint: string;
  model?: string;
  enableWebSearch?: boolean;
}

export class SecureProxyModelProvider implements ModelProvider {
  public readonly requiresNetwork = true;
  public readonly requiresProxy = true;
  public readonly id: Exclude<ModelProviderId, 'local_heuristic' | 'ollama'>;
  public readonly displayName: string;
  private readonly endpoint: string;
  private readonly model?: string;
  private readonly enableWebSearch: boolean;

  constructor(options: ProxyProviderOptions) {
    this.id = options.provider;
    this.displayName = `${options.provider.toUpperCase()} via MIO Secure Proxy`;
    this.endpoint = options.endpoint;
    this.model = options.model;
    this.enableWebSearch = options.enableWebSearch === true;
  }

  public async generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal,
      body: JSON.stringify({
        provider: this.id,
        model: this.model,
        messages: request.messages,
        applicationContext: request.applicationContext,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        enableWebSearch: this.enableWebSearch,
      }),
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      let detail = raw.slice(0, 300);
      try {
        const payload = JSON.parse(raw) as { error?: string; detail?: string };
        detail = [payload.error, payload.detail].filter(Boolean).join(' — ') || detail;
      } catch {
        // Preserve the bounded plain-text response when the proxy did not return JSON.
      }
      throw new Error(`${this.displayName} unavailable (HTTP ${response.status})${detail ? `: ${detail}` : ''}`);
    }

    const payload = (await response.json()) as Partial<ModelResponse>;
    if (!payload.text || typeof payload.text !== 'string') {
      throw new Error('MIO AI proxy returned an invalid response payload');
    }
    if (payload.provider && payload.provider !== this.id) {
      throw new Error(`MIO AI proxy returned provider '${payload.provider}' while '${this.id}' was requested`);
    }

    return {
      provider: this.id,
      model: typeof payload.model === 'string' ? payload.model : this.model ?? 'proxy-default',
      text: payload.text,
      usage: payload.usage,
      finishReason: payload.finishReason,
      generatedAt: Date.now(),
      source: 'CLOUD_PROXY',
      webSearchUsed: payload.webSearchUsed === true,
      citations: payload.citations,
    };
  }
}
