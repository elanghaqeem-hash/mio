const MAX_QUERY_CHARS = 500;
const MAX_RESULTS = 10;
const FETCH_TIMEOUT_MS = 12_000;

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

function cleanText(value, max = 1200) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function timedFetch(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function braveSearch(query, count, apiKey) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('safesearch', 'moderate');
  const response = await timedFetch(url.toString(), {
    headers: {
      accept: 'application/json',
      'x-subscription-token': apiKey,
    },
  });
  if (!response.ok) throw new Error(`Brave Search returned HTTP ${response.status}`);
  const data = await response.json();
  const results = Array.isArray(data?.web?.results) ? data.web.results : [];
  return results.slice(0, count).map((item) => ({
    title: cleanText(item?.title, 240) || 'Untitled result',
    url: String(item?.url || '').slice(0, 2048),
    summary: cleanText(item?.description, 1200),
    provider: 'Brave Search',
    reliability: 'UNVERIFIED',
    status: 'UNKNOWN',
    publishedAt: item?.age ? cleanText(item.age, 120) : null,
  })).filter((item) => /^https?:\/\//i.test(item.url));
}

async function wikipediaSearch(query, count) {
  const url = new URL('https://id.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srlimit', String(Math.min(count, 6)));
  url.searchParams.set('format', 'json');
  url.searchParams.set('utf8', '1');
  const response = await timedFetch(url.toString(), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Wikipedia returned HTTP ${response.status}`);
  const data = await response.json();
  const results = Array.isArray(data?.query?.search) ? data.query.search : [];
  return results.map((item) => ({
    title: cleanText(item?.title, 240) || 'Wikipedia result',
    url: `https://id.wikipedia.org/wiki/${encodeURIComponent(String(item?.title || '').replace(/ /g, '_'))}`,
    summary: cleanText(item?.snippet, 1200),
    provider: 'Wikipedia Indonesia',
    reliability: 'UNVERIFIED',
    status: 'UNKNOWN',
    publishedAt: null,
  }));
}

async function crossrefSearch(query, count) {
  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set('query.bibliographic', query);
  url.searchParams.set('rows', String(Math.min(count, 6)));
  url.searchParams.set('select', 'DOI,title,URL,published-print,published-online,publisher');
  const response = await timedFetch(url.toString(), {
    headers: {
      accept: 'application/json',
      'user-agent': 'MIO-V2-Research/1.0 (Cloudflare Pages Function)',
    },
  });
  if (!response.ok) throw new Error(`Crossref returned HTTP ${response.status}`);
  const data = await response.json();
  const items = Array.isArray(data?.message?.items) ? data.message.items : [];
  return items.map((item) => {
    const title = Array.isArray(item?.title) ? item.title[0] : item?.title;
    const dateParts = item?.['published-online']?.['date-parts']?.[0] || item?.['published-print']?.['date-parts']?.[0];
    return {
      title: cleanText(title, 240) || cleanText(item?.DOI, 240) || 'Crossref result',
      url: String(item?.URL || (item?.DOI ? `https://doi.org/${item.DOI}` : '')).slice(0, 2048),
      summary: cleanText([item?.publisher, item?.DOI].filter(Boolean).join(' · '), 1200),
      provider: 'Crossref',
      reliability: 'UNVERIFIED',
      status: 'UNKNOWN',
      publishedAt: Array.isArray(dateParts) ? dateParts.filter(Boolean).join('-') : null,
    };
  }).filter((item) => /^https?:\/\//i.test(item.url));
}

function uniqueResults(items, limit) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = `${item.url}|${item.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const count = Math.max(1, Math.min(MAX_RESULTS, Number(body?.count) || 8));
    if (!query || query.length > MAX_QUERY_CHARS) {
      return new Response(JSON.stringify({ error: `Query must be 1-${MAX_QUERY_CHARS} characters` }), { status: 400, headers });
    }

    let results = [];
    let provider = 'wikipedia-crossref';
    let fullWeb = false;
    let warning = 'Live public research fallback. Configure BRAVE_SEARCH_API_KEY in Cloudflare for general web coverage.';

    if (typeof env.BRAVE_SEARCH_API_KEY === 'string' && env.BRAVE_SEARCH_API_KEY.trim()) {
      results = await braveSearch(query, count, env.BRAVE_SEARCH_API_KEY.trim());
      provider = 'brave-search';
      fullWeb = true;
      warning = 'Search-engine retrieval is live, but retrieved snippets are not automatically factual verification.';
    } else {
      const settled = await Promise.allSettled([
        wikipediaSearch(query, count),
        crossrefSearch(query, count),
      ]);
      results = uniqueResults(settled.flatMap((entry) => entry.status === 'fulfilled' ? entry.value : []), count);
      if (!results.length) throw new Error('Public research sources are temporarily unavailable');
    }

    return new Response(JSON.stringify({
      query,
      provider,
      fullWeb,
      warning,
      fetchedAt: new Date().toISOString(),
      results,
    }), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research connector failed';
    return new Response(JSON.stringify({ error: message.slice(0, 500) }), { status: 502, headers });
  }
}

export function onRequest() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...headers, allow: 'POST' } });
}
