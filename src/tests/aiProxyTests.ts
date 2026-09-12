import { onRequestPost } from '../../functions/api/ai/generate';

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

  const request = (provider: string = 'openai', includeApplicationContext = false) =>
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
  assert(missingSecret.status === 503, 'AI proxy rejects cloud inference when server-side API secret is not configured');

  const unsupported = await onRequestPost({ request: request('claude'), env: { OPENAI_API_KEY: 'server-secret' } });
  assert(unsupported.status === 501, 'AI proxy rejects providers that are not explicitly enabled');

  const originalFetch = globalThis.fetch;
  let upstreamAuthorization = '';
  let upstreamBody = '';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    upstreamAuthorization = headers.get('Authorization') ?? '';
    upstreamBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        model: 'test-model',
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'normalized answer' }] }],
        usage: { input_tokens: 10, output_tokens: 3 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const success = await onRequestPost({ request: request(), env: { OPENAI_API_KEY: 'server-secret', OPENAI_MODEL: 'server-model' } });
    const body = (await success.json()) as { text?: string; source?: string };
    assert(success.status === 200 && body.text === 'normalized answer' && body.source === 'CLOUD_PROXY', 'AI proxy normalizes successful provider output for the browser');
    assert(upstreamAuthorization === 'Bearer server-secret', 'AI proxy applies provider secret only on the server-side upstream request');
    assert(!upstreamBody.includes('server-secret'), 'Server secret is not embedded inside the provider request payload');

    await onRequestPost({ request: request('openai', true), env: { OPENAI_API_KEY: 'server-secret', OPENAI_MODEL: 'server-model' } });
    const parsed = JSON.parse(upstreamBody) as { instructions?: string; input?: Array<{ role?: string; content?: string }> };
    const contextInput = parsed.input?.find((item) => item.content?.includes('[MIO_APPLICATION_CONTEXT]'));
    assert(Boolean(contextInput) && contextInput?.role === 'user', 'Typed project context is materialized as provider input data rather than system authority');
    assert(!parsed.instructions?.includes('MIO_APPLICATION_CONTEXT'), 'Project application context is never merged into provider instructions');
    assert(contextInput?.content?.includes('policy=DATA_ONLY') === true && contextInput.content.includes('trust="QUARANTINED"'), 'Provider-boundary context preserves DATA_ONLY policy and source trust metadata');
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { passed, total };
}
