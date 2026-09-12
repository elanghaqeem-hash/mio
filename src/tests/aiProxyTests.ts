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

  const request = (provider: string = 'openai') =>
    new Request('https://mio.test/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model: 'test-model', messages: [{ role: 'user', content: 'hello' }] }),
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
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { passed, total };
}
