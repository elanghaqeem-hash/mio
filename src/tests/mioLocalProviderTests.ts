import { MioLocalProvider } from '../intelligence/model/MioLocalProvider';

export async function runMioLocalProviderTests(): Promise<{ passed: number; total: number }> {
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

  const originalFetch = globalThis.fetch;
  let chatCalls = 0;
  let researchCalls = 0;
  let evidenceObserved = false;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/research')) {
      researchCalls++;
      const body = JSON.parse(String(init?.body ?? '{}')) as { query?: string };
      assert(body.query === 'MIO latest release', 'MIO Local sends only the bounded search query to research gateway');
      return new Response(JSON.stringify({
        results: [{
          title: 'MIO release note',
          url: 'https://example.com/mio-release',
          excerpt: 'The current MIO release is available.',
          sourceType: 'WEB',
          provider: 'test',
          providerSourceId: '1',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.endsWith('/api/chat')) {
      chatCalls++;
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role?: string; content?: string }> };
      evidenceObserved = evidenceObserved || body.messages?.some((message) => message.content?.includes('MIO_WEB_EVIDENCE') && message.content.includes('UNTRUSTED')) === true;
      if (chatCalls === 1) {
        return new Response(JSON.stringify({
          model: 'qwen3:8b',
          message: { content: '<MIO_TOOL_CALL>{"name":"web.search","query":"MIO latest release"}</MIO_TOOL_CALL>' },
          prompt_eval_count: 20,
          eval_count: 10,
          done_reason: 'stop',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        model: 'qwen3:8b',
        message: { content: 'Grounded answer from MIO Local [S1].' },
        prompt_eval_count: 30,
        eval_count: 12,
        done_reason: 'stop',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const provider = new MioLocalProvider({
      endpoint: 'http://127.0.0.1:11434',
      model: 'qwen3:8b',
      enableWebSearch: true,
      researchEndpoint: '/api/research',
    });
    const result = await provider.generate({ messages: [{ role: 'user', content: 'What is the latest MIO release?' }] });
    assert(result.provider === 'mio_local' && result.source === 'LOCAL_ENDPOINT', 'MIO Local is a first-class local model provider');
    assert(result.webSearchUsed === true && researchCalls === 1, 'MIO Local can execute a bounded live research cycle');
    assert(evidenceObserved, 'Web evidence is explicitly labelled as untrusted before returning to the local model');
    assert(result.citations?.[0]?.url === 'https://example.com/mio-release', 'MIO Local returns normalized web citations');
    assert(result.usage?.inputTokens === 50 && result.usage.outputTokens === 22, 'MIO Local aggregates local inference usage across agent rounds');

    chatCalls = 0;
    researchCalls = 0;
    evidenceObserved = false;
    const offlineProvider = new MioLocalProvider({
      endpoint: 'http://127.0.0.1:11434',
      model: 'qwen3:8b',
      enableWebSearch: false,
      researchEndpoint: '/api/research',
    });
    const offlineResult = await offlineProvider.generate({ messages: [{ role: 'user', content: 'Tell me something current.' }] });
    assert(offlineResult.webSearchUsed === false && researchCalls === 0, 'MIO Local never reaches research gateway when web grounding is disabled');
    assert(offlineResult.text === 'Grounded answer from MIO Local [S1].', 'MIO Local remains usable when web grounding is unavailable');
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { passed, total };
}
