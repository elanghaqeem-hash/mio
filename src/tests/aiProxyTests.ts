import { onRequestGet, onRequestPost } from '../../functions/api/ai/generate';

type TestProvider = 'openrouter' | 'openai' | 'gemini' | 'claude';

export async function runAiProxyTests(): Promise<{ passed: number; total: number }> {
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

  const request = (provider: string = 'openai', includeApplicationContext = false, enableWebSearch = false) =>
    new Request('https://mio.test/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        model: 'test-model',
        messages: [
          { role: 'system', content: 'trusted system instruction' },
          { role: 'user', content: 'hello' },
        ],
        enableWebSearch,
        ...(includeApplicationContext ? {
          applicationContext: {
            kind: 'PROJECT_KNOWLEDGE',
            policy: 'DATA_ONLY',
            projectId: 'project_test',
            contextBudgetChars: 1200,
            sources: [{
              id: 'knowledge_1',
              assetId: 'asset_1',
              label: 'BCM Plan.md',
              sourceUri: 'workspace://ws/docs/bcm.md',
              trust: 'QUARANTINED',
              score: 4,
              text: 'External project fact: recovery time objective is four hours.',
            }],
          },
        } : {}),
      }),
    });

  const missingSecret = await onRequestPost({ request: request(), env: {} });
  assert(missingSecret.status === 503, 'AI proxy rejects cloud inference when the selected provider secret is absent');

  const unsupported = await onRequestPost({ request: request('mistral'), env: { OPENAI_API_KEY: 'server-secret' } });
  assert(unsupported.status === 501, 'AI proxy rejects providers outside the explicit allowlist');

  const missingModelReadiness = await onRequestGet({ request: new Request('https://mio.test/api/ai/generate?provider=openai'), env: { OPENAI_API_KEY: 'server-secret' } });
  const missingModelBody = await missingModelReadiness.json() as { ready?: boolean; modelConfigured?: boolean };
  assert(missingModelReadiness.status === 503 && missingModelBody.ready === false && missingModelBody.modelConfigured === false, 'Readiness requires both a provider secret and an effective model');

  const readyResponse = await onRequestGet({ request: new Request('https://mio.test/api/ai/generate?provider=gemini&model=browser-model'), env: { GEMINI_API_KEY: 'gemini-secret' } });
  const readyBody = await readyResponse.json() as { provider?: string; ready?: boolean; model?: string };
  assert(readyResponse.status === 200 && readyBody.provider === 'gemini' && readyBody.ready === true && readyBody.model === 'browser-model', 'Readiness evaluates the selected provider and browser-selected model');

  const originalFetch = globalThis.fetch;
  const captured = new Map<TestProvider, { headers: Headers; body: string }>();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const provider: TestProvider = url.includes('openrouter.ai') ? 'openrouter' : url.includes('openai.com') ? 'openai' : url.includes('googleapis.com') ? 'gemini' : 'claude';
    const body = String(init?.body ?? '');
    captured.set(provider, { headers: new Headers(init?.headers), body });
    const parsed = JSON.parse(body) as Record<string, unknown>;

    if (provider === 'openrouter') {
      const plugins = parsed.plugins as Array<{ id?: string }> | undefined;
      return new Response(JSON.stringify({
        model: 'routed-test-model',
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'openrouter answer', annotations: plugins ? [{ type: 'url_citation', url_citation: { url: 'https://openrouter.example/source', title: 'OpenRouter source' } }] : [] } }],
        usage: { prompt_tokens: 9, completion_tokens: 3, ...(plugins ? { server_tool_use: { web_search_requests: 1 } } : {}) },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (provider === 'openai') {
      const tools = parsed.tools as Array<{ type?: string }> | undefined;
      return new Response(JSON.stringify({
        model: 'openai-test-model',
        status: 'completed',
        output: [
          ...(tools?.some((tool) => tool.type === 'web_search') ? [{ type: 'web_search_call' }] : []),
          { type: 'message', content: [{ type: 'output_text', text: 'openai answer', annotations: tools ? [{ type: 'url_citation', url: 'https://openai.example/source', title: 'OpenAI source' }] : [] }] },
        ],
        usage: { input_tokens: 10, output_tokens: 3 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (provider === 'gemini') {
      const tools = parsed.tools as Array<{ googleSearch?: object }> | undefined;
      return new Response(JSON.stringify({
        modelVersion: 'gemini-test-model',
        candidates: [{
          content: { parts: [{ text: 'gemini answer' }] },
          finishReason: 'STOP',
          ...(tools?.some((tool) => tool.googleSearch) ? { groundingMetadata: { webSearchQueries: ['current query'], groundingChunks: [{ web: { uri: 'https://gemini.example/source', title: 'Gemini source' } }] } } : {}),
        }],
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 4 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const tools = parsed.tools as Array<{ name?: string }> | undefined;
    return new Response(JSON.stringify({
      model: 'claude-test-model',
      stop_reason: 'end_turn',
      content: [
        ...(tools?.some((tool) => tool.name === 'web_search') ? [{ type: 'server_tool_use', name: 'web_search' }] : []),
        { type: 'text', text: 'claude answer', citations: tools ? [{ url: 'https://claude.example/source', title: 'Claude source' }] : [] },
      ],
      usage: { input_tokens: 12, output_tokens: 5, ...(tools ? { server_tool_use: { web_search_requests: 1 } } : {}) },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const environments = {
      openrouter: { OPENROUTER_API_KEY: 'openrouter-secret' },
      openai: { OPENAI_API_KEY: 'openai-secret' },
      gemini: { GEMINI_API_KEY: 'gemini-secret' },
      claude: { ANTHROPIC_API_KEY: 'claude-secret' },
    };
    const expectedText = { openrouter: 'openrouter answer', openai: 'openai answer', gemini: 'gemini answer', claude: 'claude answer' };

    for (const provider of ['openrouter', 'openai', 'gemini', 'claude'] as TestProvider[]) {
      const success = await onRequestPost({ request: request(provider), env: environments[provider] });
      const body = await success.json() as { provider?: string; text?: string; source?: string };
      assert(success.status === 200 && body.provider === provider && body.text === expectedText[provider] && body.source === 'CLOUD_PROXY', `${provider} output is normalized into the common browser response contract`);
    }

    assert(captured.get('openrouter')?.headers.get('Authorization') === 'Bearer openrouter-secret', 'OpenRouter secret is applied only to the server-side Authorization header');
    assert(captured.get('openai')?.headers.get('Authorization') === 'Bearer openai-secret', 'OpenAI secret is applied only to the server-side Authorization header');
    assert(captured.get('gemini')?.headers.get('x-goog-api-key') === 'gemini-secret', 'Gemini secret is applied only to the server-side Google API header');
    assert(captured.get('claude')?.headers.get('x-api-key') === 'claude-secret', 'Claude secret is applied only to the server-side Anthropic API header');
    assert([...captured.values()].every((entry) => !entry.body.includes('secret')), 'No provider secret is embedded in an upstream request body');

    await onRequestPost({ request: request('openai', true), env: environments.openai });
    const openAiPayload = JSON.parse(captured.get('openai')?.body ?? '{}') as { instructions?: string; input?: Array<{ role?: string; content?: string }> };
    const contextInput = openAiPayload.input?.find((item) => item.content?.includes('[MIO_APPLICATION_CONTEXT]'));
    assert(Boolean(contextInput) && contextInput?.role === 'user', 'Project context remains provider input data rather than system authority');
    assert(!openAiPayload.instructions?.includes('MIO_APPLICATION_CONTEXT'), 'Project data is never merged into trusted provider instructions');
    assert(contextInput?.content?.includes('policy=DATA_ONLY') === true && contextInput.content.includes('trust="QUARANTINED"'), 'Provider-boundary context preserves policy and trust metadata');

    for (const provider of ['openrouter', 'openai', 'gemini', 'claude'] as TestProvider[]) {
      const response = await onRequestPost({ request: request(provider, false, true), env: environments[provider] });
      const body = await response.json() as { webSearchUsed?: boolean; citations?: Array<{ url?: string }> };
      assert(body.webSearchUsed === true, `${provider} reports actual provider-side web search execution`);
      assert(body.citations?.length === 1 && body.citations[0].url?.startsWith('https://') === true, `${provider} returns a normalized web citation for display`);
    }
    const openRouterPlugins = JSON.parse(captured.get('openrouter')?.body ?? '{}') as { plugins?: Array<{ id?: string }> };
    const openAiTools = JSON.parse(captured.get('openai')?.body ?? '{}') as { tools?: Array<{ type?: string }> };
    const geminiTools = JSON.parse(captured.get('gemini')?.body ?? '{}') as { tools?: Array<{ googleSearch?: object }> };
    const claudeTools = JSON.parse(captured.get('claude')?.body ?? '{}') as { tools?: Array<{ type?: string; name?: string }> };
    assert(openRouterPlugins.plugins?.some((plugin) => plugin.id === 'web') === true, 'OpenRouter web search uses its model-agnostic web plugin contract');
    assert(openAiTools.tools?.some((tool) => tool.type === 'web_search') === true, 'OpenAI web search uses the Responses API tool contract');
    assert(geminiTools.tools?.some((tool) => Boolean(tool.googleSearch)) === true, 'Gemini web search uses Google Search grounding');
    assert(claudeTools.tools?.some((tool) => tool.type === 'web_search_20250305' && tool.name === 'web_search') === true, 'Claude web search uses the Anthropic server tool contract');
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { passed, total };
}
