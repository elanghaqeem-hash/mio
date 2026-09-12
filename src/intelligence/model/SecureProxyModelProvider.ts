import { ModelProvider, ModelProviderId, ModelRequest, ModelResponse } from '../../types/models';

interface ProxyProviderOptions {
  provider: Exclude<ModelProviderId, 'local_heuristic' | 'ollama'>;
  endpoint: string;
  model?: string;
}

export class SecureProxyModelProvider implements ModelProvider {
  public readonly requiresNetwork = true;
  public readonly requiresProxy = true;
  public readonly id: Exclude<ModelProviderId, 'local_heuristic' | 'ollama'>;
  public readonly displayName: string;
  private readonly endpoint: string;
  private readonly model?: string;

  constructor(options: ProxyProviderOptions) {
    this.id = options.provider;
    this.displayName = `${options.provider.toUpperCase()} via MIO Secure Proxy`;
    this.endpoint = options.endpoint;
    this.model = options.model;
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
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`MIO AI proxy returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }

    const payload = (await response.json()) as Partial<ModelResponse>;
    if (!payload.text || typeof payload.text !== 'string') {
      throw new Error('MIO AI proxy returned an invalid response payload');
    }

    return {
      provider: this.id,
      model: typeof payload.model === 'string' ? payload.model : this.model ?? 'proxy-default',
      text: payload.text,
      usage: payload.usage,
      finishReason: payload.finishReason,
      generatedAt: Date.now(),
      source: 'CLOUD_PROXY',
    };
  }
}
