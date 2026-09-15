type ResearchSourceType = 'ENCYCLOPEDIA' | 'ACADEMIC' | 'WEB';

interface Env {
  BRAVE_SEARCH_API_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

interface ProxyResearchResult {
  provider: string;
  providerSourceId: string;
  title: string;
  url: string;
  excerpt: string;
  authors?: string[];
  publishedAt?: string;
  sourceType: ResearchSourceType;
  metadata?: Record<string, string | number | boolean | null>;
}

const MAX_QUERY_CHARS = 500;
const MAX_RESULTS = 10;
const FETCH_TIMEOUT_MS = 12_000;

const json = (payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...extraHeaders,
    },
  });

const cleanText = (value: unknown, max = 1_200): string =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const safeHttpsUrl = (value: unknown): string | undefined => {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' ? url.toString().slice(0, 2_048) : undefined;
  } catch {
    return undefined;
  }
};

async function timedFetch(url: URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function braveSearch(query: string, count: number, apiKey: string): Promise<ProxyResearchResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('safesearch', 'moderate');
  const response = await timedFetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
  });
  if (!response.ok) throw new Error(`Brave Search returned HTTP ${response.status}`);

  const data = (await response.json()) as {
    web?: { results?: Array<{ title?: unknown; url?: unknown; description?: unknown; age?: unknown }> };
  };
  return (data.web?.results ?? []).slice(0, count).flatMap((item, index) => {
    const resultUrl = safeHttpsUrl(item.url);
    if (!resultUrl) return [];
    return [{
      provider: 'brave',
      providerSourceId: `brave-${index}-${resultUrl}`.slice(0, 500),
      title: cleanText(item.title, 240) || 'Untitled result',
      url: resultUrl,
      excerpt: cleanText(item.description),
      publishedAt: cleanText(item.age, 120) || undefined,
      sourceType: 'WEB' as const,
      metadata: { retrievedBy: 'brave-search' },
    }];
  });
}

async function wikipediaSearch(query: string, count: number): Promise<ProxyResearchResult[]> {
  const url = new URL('https://id.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srlimit', String(Math.min(count, 6)));
  url.searchParams.set('format', 'json');
  url.searchParams.set('utf8', '1');
  const response = await timedFetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Wikipedia returned HTTP ${response.status}`);

  const data = (await response.json()) as {
    query?: { search?: Array<{ pageid?: number; title?: unknown; snippet?: unknown }> };
  };
  return (data.query?.search ?? []).map((item, index) => {
    const title = cleanText(item.title, 240) || 'Wikipedia result';
    return {
      provider: 'wikipedia-id',
      providerSourceId: String(item.pageid ?? `wikipedia-${index}`),
      title,
      url: `https://id.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      excerpt: cleanText(item.snippet),
      sourceType: 'ENCYCLOPEDIA' as const,
      metadata: { language: 'id', pageId: item.pageid ?? null },
    };
  });
}

async function crossrefSearch(query: string, count: number): Promise<ProxyResearchResult[]> {
  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set('query.bibliographic', query);
  url.searchParams.set('rows', String(Math.min(count, 6)));
  url.searchParams.set('select', 'DOI,URL,title,author,published-print,published-online,publisher');
  const response = await timedFetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MIO-V2-Research/1.0 (Cloudflare Pages Function)',
    },
  });
  if (!response.ok) throw new Error(`Crossref returned HTTP ${response.status}`);

  const data = (await response.json()) as {
    message?: {
      items?: Array<{
        DOI?: string;
        URL?: string;
        title?: string[];
        author?: Array<{ given?: string; family?: string }>;
        'published-print'?: { 'date-parts'?: number[][] };
        'published-online'?: { 'date-parts'?: number[][] };
        publisher?: string;
      }>;
    };
  };
  return (data.message?.items ?? []).flatMap((item, index) => {
    const doi = cleanText(item.DOI, 300);
    const resultUrl = safeHttpsUrl(item.URL || (doi ? `https://doi.org/${doi}` : ''));
    if (!resultUrl) return [];
    const dateParts = item['published-online']?.['date-parts']?.[0] ?? item['published-print']?.['date-parts']?.[0];
    const authors = (item.author ?? [])
      .map((author) => cleanText([author.given, author.family].filter(Boolean).join(' '), 240))
      .filter(Boolean)
      .slice(0, 20);
    return [{
      provider: 'crossref',
      providerSourceId: doi || `crossref-${index}`,
      title: cleanText(item.title?.[0], 240) || doi || 'Crossref result',
      url: resultUrl,
      excerpt: cleanText([item.publisher, doi].filter(Boolean).join(' · ')),
      authors,
      publishedAt: Array.isArray(dateParts) ? dateParts.filter(Number.isFinite).join('-') : undefined,
      sourceType: 'ACADEMIC' as const,
      metadata: { doi: doi || null, publisher: cleanText(item.publisher, 300) || null },
    }];
  });
}

function uniqueResults(items: ProxyResearchResult[], limit: number): ProxyResearchResult[] {
  const seen = new Set<string>();
  const output: ProxyResearchResult[] = [];
  for (const item of items) {
    const key = `${item.url}|${item.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  return json({
    ready: true,
    provider: context.env.BRAVE_SEARCH_API_KEY?.trim() ? 'brave-search' : 'wikipedia-crossref',
    fullWeb: Boolean(context.env.BRAVE_SEARCH_API_KEY?.trim()),
    detail: context.env.BRAVE_SEARCH_API_KEY?.trim()
      ? 'Same-origin research proxy is ready with Brave Search.'
      : 'Same-origin research proxy is ready with public Wikipedia Indonesia and Crossref sources. Configure BRAVE_SEARCH_API_KEY for broader web coverage.',
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  let body: { query?: unknown; count?: unknown };
  try {
    body = (await context.request.json()) as { query?: unknown; count?: unknown };
  } catch {
    return json({ error: 'Invalid JSON request body' }, 400);
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  const numericCount = typeof body.count === 'number' ? body.count : Number(body.count);
  const count = Math.max(1, Math.min(MAX_RESULTS, Number.isFinite(numericCount) ? Math.round(numericCount) : 8));
  if (!query || query.length > MAX_QUERY_CHARS) {
    return json({ error: `Query must be 1-${MAX_QUERY_CHARS} characters` }, 400);
  }

  try {
    const braveKey = context.env.BRAVE_SEARCH_API_KEY?.trim();
    if (braveKey) {
      const results = uniqueResults(await braveSearch(query, count, braveKey), count);
      return json({
        query,
        provider: 'brave-search',
        fullWeb: true,
        warning: 'Search-engine snippets are untrusted external data until MIO evaluates and governs them.',
        fetchedAt: new Date().toISOString(),
        results,
        providerErrors: [],
      });
    }

    const settled = await Promise.allSettled([wikipediaSearch(query, count), crossrefSearch(query, count)]);
    const results = uniqueResults(settled.flatMap((entry) => entry.status === 'fulfilled' ? entry.value : []), count);
    const providerIds = ['wikipedia-id', 'crossref'];
    const providerErrors = settled.flatMap((entry, index) => entry.status === 'rejected'
      ? [{ provider: providerIds[index], error: cleanText(entry.reason instanceof Error ? entry.reason.message : entry.reason, 500) }]
      : []);
    if (results.length === 0) throw new Error('Public research sources are temporarily unavailable');

    return json({
      query,
      provider: 'wikipedia-crossref',
      fullWeb: false,
      warning: 'Public-source fallback is live. Configure BRAVE_SEARCH_API_KEY for broader general-web coverage.',
      fetchedAt: new Date().toISOString(),
      results,
      providerErrors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research connector failed';
    return json({ error: cleanText(message, 500) }, 502);
  }
}
