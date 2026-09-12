import { ModelRouter } from '../agents/ModelRouter';
import { LocalHeuristicProvider } from '../intelligence/model/LocalHeuristicProvider';
import { SecureProxyModelProvider } from '../intelligence/model/SecureProxyModelProvider';

export async function runModelRouterTests(): Promise<{ passed: number; total: number }> {
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

  const local = await new LocalHeuristicProvider().generate({ messages: [{ role: 'user', content: 'Explain MIO briefly' }] });
  assert(local.source === 'LOCAL' && local.provider === 'local_heuristic' && local.text.includes('offline heuristic'), 'Local provider identifies itself honestly as offline heuristic');

  ModelRouter.setNetworkState('OFFLINE');
  ModelRouter.configure({ provider: 'openai', allowOfflineFallback: true, proxyEndpoint: '/api/ai/generate' });
  const offlineFallback = await ModelRouter.generate({ messages: [{ role: 'user', content: 'Hello' }] }, 1000);
  assert(offlineFallback.provider === 'local_heuristic' && offlineFallback.source === 'LOCAL', 'ModelRouter uses explicit local fallback when cloud provider is selected but network mode is OFFLINE');

  const originalFetch = globalThis.fetch;
  let capturedBody = '';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ provider: 'openai', model: 'test-model', text: 'secure response', source: 'CLOUD_PROXY' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const proxyProvider = new SecureProxyModelProvider({ provider: 'openai', endpoint: '/api/ai/generate', model: 'test-model' });
    const proxyResult = await proxyProvider.generate({ messages: [{ role: 'user', content: 'test prompt' }] });
    assert(proxyResult.source === 'CLOUD_PROXY' && proxyResult.text === 'secure response', 'SecureProxyModelProvider accepts normalized same-origin proxy responses');
    assert(!/api.?key|bearer|secret/i.test(capturedBody), 'Browser-side proxy request contains no API key, bearer token, or secret field');
  } finally {
    globalThis.fetch = originalFetch;
    ModelRouter.configure({ provider: 'local_heuristic', allowOfflineFallback: true });
    ModelRouter.setNetworkState('OFFLINE');
  }

  return { passed, total };
}
