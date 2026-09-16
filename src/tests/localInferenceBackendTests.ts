import { ModelRouter } from '../agents/ModelRouter';
import { assertLoopbackInferenceEndpoint, createLocalInferenceBackend } from '../intelligence/model/LocalInferenceBackend';

export async function runLocalInferenceBackendTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ [PASS] ${name}`);
    } else {
      console.error(`✗ [FAIL] ${name}`);
    }
  };

  let remoteRejected = false;
  try { assertLoopbackInferenceEndpoint('http://192.168.1.10:8000'); } catch { remoteRejected = true; }
  assert(remoteRejected, 'MIO Local rejects non-loopback inference endpoints');
  assert(assertLoopbackInferenceEndpoint('http://localhost:8000') === 'http://localhost:8000', 'MIO Local accepts localhost inference endpoints');

  const originalFetch = globalThis.fetch;
  const observed: Array<{ url: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let body: Record<string, unknown> | undefined;
    if (typeof init?.body === 'string' && init.body) body = JSON.parse(init.body) as Record<string, unknown>;
    observed.push({ url, body });

    if (url.endsWith('/api/tags')) {
      return new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/chat')) {
      return new Response(JSON.stringify({
        model: 'qwen3:8b',
        message: { content: 'ollama response' },
        prompt_eval_count: 11,
        eval_count: 7,
        done_reason: 'stop',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/v1/models')) {
      const model = url.includes(':8080') ? 'mio-local-gguf' : 'Qwen/Qwen3-8B';
      return new Response(JSON.stringify({ data: [{ id: model }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/v1/chat/completions')) {
      return new Response(JSON.stringify({
        model: String(body?.model ?? 'unknown'),
        choices: [{ message: { content: 'openai-compatible response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 13, completion_tokens: 9 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const ollama = createLocalInferenceBackend('ollama', 'http://127.0.0.1:11434', 'qwen3:8b');
    const ollamaReady = await ollama.checkReadiness();
    const ollamaChat = await ollama.chat([{ role: 'user', content: 'hello' }], { messages: [] });
    assert(ollamaReady.ready && ollamaChat.text === 'ollama response', 'Ollama backend uses native tags/chat protocol');
    assert(observed.some((call) => call.url.endsWith('/api/chat') && call.body?.model === 'qwen3:8b'), 'Ollama backend sends configured model to /api/chat');

    const vllm = createLocalInferenceBackend('vllm', 'http://127.0.0.1:8000', 'Qwen/Qwen3-8B');
    const vllmReady = await vllm.checkReadiness();
    const vllmChat = await vllm.chat([{ role: 'user', content: 'hello' }], { messages: [], temperature: 0.2, maxOutputTokens: 123 });
    assert(vllmReady.ready && vllmChat.text === 'openai-compatible response', 'vLLM backend uses OpenAI-compatible model discovery and chat');
    const vllmCall = observed.find((call) => call.url === 'http://127.0.0.1:8000/v1/chat/completions');
    assert(vllmCall?.body?.model === 'Qwen/Qwen3-8B' && vllmCall.body.max_tokens === 123, 'vLLM request maps MIO generation controls to OpenAI-compatible fields');

    const llamaCpp = createLocalInferenceBackend('llamacpp', 'http://127.0.0.1:8080', 'mio-alias');
    const llamaReady = await llamaCpp.checkReadiness();
    const llamaChat = await llamaCpp.chat([{ role: 'user', content: 'hello' }], { messages: [] });
    assert(llamaReady.ready && llamaReady.detail.includes('mio-local-gguf') && llamaChat.text === 'openai-compatible response', 'llama.cpp accepts its single loaded model while explaining alias mismatch');

    ModelRouter.setNetworkState('OFFLINE');
    ModelRouter.configure({
      provider: 'mio_local',
      mioLocalBackend: 'vllm',
      mioLocalEndpoint: 'http://127.0.0.1:8000',
      model: 'Qwen/Qwen3-8B',
      enableWebSearch: false,
      allowOfflineFallback: false,
    });
    const routerReady = await ModelRouter.checkProviderReadiness(1000, true);
    assert(routerReady.ready && routerReady.detail.includes('vLLM'), 'ModelRouter readiness follows the selected MIO Local backend while OFFLINE');
  } finally {
    globalThis.fetch = originalFetch;
    ModelRouter.configure({
      provider: 'local_heuristic',
      mioLocalBackend: 'ollama',
      mioLocalEndpoint: 'http://127.0.0.1:11434',
      model: undefined,
      enableWebSearch: false,
      allowOfflineFallback: true,
    });
    ModelRouter.setNetworkState('OFFLINE');
  }

  return { passed, total };
}
