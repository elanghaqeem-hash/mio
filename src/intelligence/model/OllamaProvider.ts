import { ModelProvider, ModelRequest, ModelResponse } from '../../types/models';

export class OllamaProvider implements ModelProvider {
  public readonly id = 'ollama' as const;
  public readonly displayName = 'Local Ollama';
  public readonly requiresNetwork = false;
  public readonly requiresProxy = false;

  constructor(
    private readonly endpoint: string = 'http://127.0.0.1:11434',
    private readonly model: string = 'llama3.2'
  ) {}

  public async generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    const response = await fetch(`${this.endpoint.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: request.messages,
        options: {
          temperature: request.temperature,
          num_predict: request.maxOutputTokens,
        },
      }),
    });

    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const payload = (await response.json()) as {
      message?: { content?: string };
      model?: string;
      prompt_eval_count?: number;
      eval_count?: number;
      done_reason?: string;
    };

    const text = payload.message?.content?.trim();
    if (!text) throw new Error('Ollama returned an empty response');

    return {
      provider: this.id,
      model: payload.model ?? this.model,
      text,
      usage: { inputTokens: payload.prompt_eval_count, outputTokens: payload.eval_count },
      finishReason: payload.done_reason,
      generatedAt: Date.now(),
      source: 'LOCAL_ENDPOINT',
    };
  }
}
