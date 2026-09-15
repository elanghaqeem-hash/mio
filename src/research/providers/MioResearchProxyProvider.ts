import { SearchProvider, SearchProviderResult } from '../SearchProvider';
import { RawResearchResult, ResearchQueryPlan } from '../../types/research';

interface ResearchProxyResponse {
  results?: unknown[];
  providerErrors?: unknown[];
}

const SOURCE_TYPES = new Set<RawResearchResult['sourceType']>(['ENCYCLOPEDIA', 'ACADEMIC', 'DOCUMENTATION', 'WEB']);

function parseResult(value: unknown): RawResearchResult | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Partial<RawResearchResult>;
  if (
    typeof item.provider !== 'string' ||
    typeof item.providerSourceId !== 'string' ||
    typeof item.title !== 'string' ||
    typeof item.url !== 'string' ||
    typeof item.excerpt !== 'string' ||
    !SOURCE_TYPES.has(item.sourceType as RawResearchResult['sourceType'])
  ) return undefined;

  try {
    if (new URL(item.url).protocol !== 'https:') return undefined;
  } catch {
    return undefined;
  }

  return {
    provider: item.provider.slice(0, 100),
    providerSourceId: item.providerSourceId.slice(0, 500),
    title: item.title.slice(0, 500),
    url: item.url.slice(0, 2_048),
    excerpt: item.excerpt.slice(0, 5_000),
    sourceType: item.sourceType as RawResearchResult['sourceType'],
    ...(Array.isArray(item.authors) ? { authors: item.authors.filter((author): author is string => typeof author === 'string').slice(0, 20) } : {}),
    ...(typeof item.publishedAt === 'string' ? { publishedAt: item.publishedAt.slice(0, 120) } : {}),
    ...(item.metadata && typeof item.metadata === 'object' ? { metadata: item.metadata } : {}),
  };
}

export class MioResearchProxyProvider implements SearchProvider {
  public readonly id = 'mio-research-proxy';
  public readonly displayName = 'MIO Secure Research Proxy';

  constructor(private readonly endpoint = '/api/research') {}

  public async search(plan: ResearchQueryPlan, signal?: AbortSignal): Promise<RawResearchResult[]> {
    return (await this.searchWithDiagnostics(plan, signal)).results;
  }

  public async searchWithDiagnostics(plan: ResearchQueryPlan, signal?: AbortSignal): Promise<SearchProviderResult> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: plan.normalizedQuery, count: Math.min(plan.maxResults, 10) }),
      signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`MIO research proxy failed: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 500)}` : ''}`);
    }

    const payload = (await response.json()) as ResearchProxyResponse;
    const results = (payload.results ?? []).flatMap((item) => {
      const parsed = parseResult(item);
      return parsed ? [parsed] : [];
    }).slice(0, plan.maxResults);
    const providerErrors = (payload.providerErrors ?? []).flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const item = value as { provider?: unknown; error?: unknown };
      return typeof item.provider === 'string' && typeof item.error === 'string'
        ? [{ provider: item.provider.slice(0, 100), error: item.error.slice(0, 500) }]
        : [];
    }).slice(0, 10);
    return { results, providerErrors };
  }
}
