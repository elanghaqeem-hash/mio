import { ModelMessage, ModelRequest } from '../../types/models';

export type LocalInferenceBackendId = 'ollama' | 'vllm' | 'llamacpp';

export interface LocalInferenceChatResult {
  model: string;
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
}

export interface LocalInferenceReadiness {
  ready: boolean;
  detail: string;
}

export interface LocalInferenceBackend {
  readonly id: LocalInferenceBackendId;
  readonly displayName: string;
  readonly endpoint: string;
  readonly model: string;
  chat(messages: ModelMessage[], request: ModelRequest, signal?: AbortSignal): Promise<LocalInferenceChatResult>;
  checkReadiness(signal?: AbortSignal): Promise<LocalInferenceReadiness>;
}

const DEFAULT_ENDPOINTS: Record<LocalInferenceBackendId, string> = {
  ollama: 'http://127.0.0.1:11434',
  vllm: 'http://127.0.0.1:8000',
  llamacpp: 'http://127.0.0.1:8080',
};

const DISPLAY_NAMES: Record<LocalInferenceBackendId, string> = {
  ollama: 'Ollama',
  vllm: 'vLLM',
  llamacpp: 'llama.cpp server',
};

function cleanEndpoint(value: string): string {
  return value.replace(/\/$/, '');
}

export function defaultLocalInferenceEndpoint(id: LocalInferenceBackendId): string {
  return DEFAULT_ENDPOINTS[id];
}

export function assertLoopbackInferenceEndpoint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('MIO Local inference endpoint is invalid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('MIO Local inference endpoint must use HTTP or HTTPS');
  }
  if (url.username || url.password) throw new Error('Credentials embedded in MIO Local endpoint URLs are not allowed');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (!loopback) {
    throw new Error('MIO Local inference is restricted to loopback endpoints. Use a separately governed remote provider for non-local inference.');
  }
  return cleanEndpoint(url.toString());
}

class OllamaInferenceBackend implements LocalInferenceBackend {
  public readonly id = 'ollama' as const;
  public readonly displayName = DISPLAY_NAMES.ollama;
  public readonly endpoint: string;

  constructor(endpoint: string, public readonly model: string) {
    this.endpoint = assertLoopbackInferenceEndpoint(endpoint);
  }

  public async chat(messages: ModelMessage[], request: ModelRequest, signal?: AbortSignal): Promise<LocalInferenceChatResult> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages,
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
      model: payload.model ?? this.model,
      text,
      inputTokens: payload.prompt_eval_count,
      outputTokens: payload.eval_count,
      finishReason: payload.done_reason,
    };
  }

  public async checkReadiness(signal?: AbortSignal): Promise<LocalInferenceReadiness> {
    const response = await fetch(`${this.endpoint}/api/tags`, { signal });
    if (!response.ok) return { ready: false, detail: `Ollama readiness returned HTTP ${response.status}` };
    const payload = await response.json().catch(() => ({})) as { models?: Array<{ name?: string }> };
    const installed = payload.models?.some((item) => item.name === this.model || item.name?.startsWith(`${this.model}:`)) === true;
    return installed
      ? { ready: true, detail: `Ollama is reachable and model '${this.model}' is installed.` }
      : { ready: false, detail: `Ollama is reachable, but model '${this.model}' is not installed.` };
  }
}

class OpenAICompatibleLocalBackend implements LocalInferenceBackend {
  public readonly endpoint: string;
  public readonly displayName: string;

  constructor(
    public readonly id: 'vllm' | 'llamacpp',
    endpoint: string,
    public readonly model: string,
  ) {
    this.endpoint = assertLoopbackInferenceEndpoint(endpoint);
    this.displayName = DISPLAY_NAMES[id];
  }

  public async chat(messages: ModelMessage[], request: ModelRequest, signal?: AbortSignal): Promise<LocalInferenceChatResult> {
    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages,
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
      }),
    });
    if (!response.ok) throw new Error(`${this.displayName} returned HTTP ${response.status}`);
    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error(`${this.displayName} returned an empty response`);
    return {
      model: payload.model ?? this.model,
      text,
      inputTokens: payload.usage?.prompt_tokens,
      outputTokens: payload.usage?.completion_tokens,
      finishReason: payload.choices?.[0]?.finish_reason ?? undefined,
    };
  }

  public async checkReadiness(signal?: AbortSignal): Promise<LocalInferenceReadiness> {
    const response = await fetch(`${this.endpoint}/v1/models`, { signal });
    if (!response.ok) return { ready: false, detail: `${this.displayName} model discovery returned HTTP ${response.status}` };
    const payload = await response.json().catch(() => ({})) as { data?: Array<{ id?: string }> };
    const ids = (payload.data ?? []).flatMap((item) => typeof item.id === 'string' ? [item.id] : []);
    if (ids.length === 0) return { ready: false, detail: `${this.displayName} is reachable, but no loaded model was reported.` };
    const exact = ids.includes(this.model);
    if (exact) return { ready: true, detail: `${this.displayName} is reachable and model '${this.model}' is loaded.` };
    if (this.id === 'llamacpp' && ids.length === 1) {
      return { ready: true, detail: `${this.displayName} is reachable with loaded model '${ids[0]}'. Requests will use configured model alias '${this.model}'; set llama.cpp --alias to make identities match exactly.` };
    }
    return { ready: false, detail: `${this.displayName} is reachable, but configured model '${this.model}' was not found. Loaded models: ${ids.slice(0, 5).join(', ')}.` };
  }
}

export function createLocalInferenceBackend(
  id: LocalInferenceBackendId = 'ollama',
  endpoint?: string,
  model = 'qwen3:8b',
): LocalInferenceBackend {
  const resolvedEndpoint = endpoint?.trim() || defaultLocalInferenceEndpoint(id);
  if (id === 'ollama') return new OllamaInferenceBackend(resolvedEndpoint, model);
  return new OpenAICompatibleLocalBackend(id, resolvedEndpoint, model);
}
