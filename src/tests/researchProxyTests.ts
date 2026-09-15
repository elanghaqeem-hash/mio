import { onRequestGet, onRequestPost } from '../../functions/api/research';
import { MioResearchProxyProvider } from '../research/providers/MioResearchProxyProvider';

export async function runResearchProxyTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, name: string) => {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ [PASS] ${name}`);
    } else {
      console.error(`✗ [FAIL] ${name}`);
    }
  };

  const readiness = await onRequestGet({ request: new Request('https://mio.test/api/research'), env: {} });
  const readinessBody = await readiness.json() as { ready?: boolean; provider?: string; fullWeb?: boolean };
  check(readiness.status === 200 && readinessBody.ready === true && readinessBody.provider === 'wikipedia-crossref' && readinessBody.fullWeb === false, 'Research proxy exposes honest public-source fallback readiness');

  const invalidJson = await onRequestPost({
    request: new Request('https://mio.test/api/research', { method: 'POST', body: '{' }),
    env: {},
  });
  check(invalidJson.status === 400, 'Research proxy rejects malformed JSON');

  const invalidQuery = await onRequestPost({
    request: new Request('https://mio.test/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '' }) }),
    env: {},
  });
  check(invalidQuery.status === 400, 'Research proxy rejects empty queries');

  const originalFetch = globalThis.fetch;
  const upstreamUrls: string[] = [];
  let braveHeader = '';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    upstreamUrls.push(url);
    if (url.includes('api.search.brave.com')) {
      braveHeader = new Headers(init?.headers).get('X-Subscription-Token') ?? '';
      return new Response(JSON.stringify({ web: { results: [
        { title: '<b>Secure result</b>', url: 'https://example.test/research', description: '<script>bad()</script> useful result' },
        { title: 'Unsafe URL', url: 'http://example.test/plaintext', description: 'rejected' },
      ] } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('wikipedia.org')) {
      return new Response(JSON.stringify({ query: { search: [{ pageid: 7, title: 'MIO', snippet: '<span>Knowledge</span>' }] } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('crossref.org')) {
      return new Response(JSON.stringify({ message: { items: [{ DOI: '10.1/test', URL: 'https://doi.org/10.1/test', title: ['MIO Paper'], publisher: 'Example Press', author: [{ given: 'Ada', family: 'Lovelace' }], 'published-online': { 'date-parts': [[2026, 9, 15]] } }] } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected upstream URL: ${url}`);
  }) as typeof fetch;

  try {
    const fallback = await onRequestPost({
      request: new Request('https://mio.test/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'mio architecture', count: 8 }) }),
      env: {},
    });
    const fallbackBody = await fallback.json() as { results?: Array<{ provider?: string; excerpt?: string }>; fullWeb?: boolean };
    check(fallback.status === 200 && fallbackBody.results?.length === 2 && fallbackBody.fullWeb === false, 'Research proxy combines Wikipedia and Crossref fallback results');
    check(fallbackBody.results?.every((item) => !item.excerpt?.includes('<')) === true, 'Research proxy removes upstream HTML before returning external data');
    check(upstreamUrls.every((url) => url.startsWith('https://id.wikipedia.org/') || url.startsWith('https://api.crossref.org/')), 'Fallback retrieval is restricted to fixed HTTPS upstreams');

    upstreamUrls.length = 0;
    const brave = await onRequestPost({
      request: new Request('https://mio.test/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'current mio status', count: 5 }) }),
      env: { BRAVE_SEARCH_API_KEY: 'server-only-secret' },
    });
    const braveText = await brave.text();
    const braveBody = JSON.parse(braveText) as { results?: Array<{ url?: string }>; fullWeb?: boolean };
    check(brave.status === 200 && braveBody.fullWeb === true && braveBody.results?.length === 1, 'Configured Brave Search enables bounded general-web retrieval and rejects non-HTTPS results');
    check(braveHeader === 'server-only-secret' && !braveText.includes('server-only-secret'), 'Research secret remains server-side and is never returned to the browser');

    globalThis.fetch = (async (_input: RequestInfo | URL) => new Response(JSON.stringify({
      results: [
        { provider: 'proxy-test', providerSourceId: '1', title: 'Valid', url: 'https://example.test/valid', excerpt: 'Safe result', sourceType: 'WEB' },
        { provider: 'proxy-test', providerSourceId: '2', title: 'Invalid', url: 'http://example.test/invalid', excerpt: 'Plain HTTP', sourceType: 'WEB' },
      ],
      providerErrors: [{ provider: 'crossref', error: 'HTTP 503' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const clientResults = await new MioResearchProxyProvider().searchWithDiagnostics({ originalQuery: 'test', normalizedQuery: 'test', intents: ['GENERAL'], maxResults: 5 });
    check(clientResults.results.length === 1 && clientResults.results[0].url === 'https://example.test/valid', 'Browser provider validates the same-origin response contract before research ingestion');
    check(clientResults.providerErrors.length === 1 && clientResults.providerErrors[0].provider === 'crossref', 'Browser provider preserves bounded partial-upstream diagnostics');
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { passed, total };
}
