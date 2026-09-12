import { SearchProvider } from '../SearchProvider';
import { RawResearchResult, ResearchQueryPlan } from '../../types/research';

interface WikipediaSearchResponse {
  query?: { search?: Array<{ pageid: number; title: string; snippet: string }> };
}

export class WikipediaProvider implements SearchProvider {
  public readonly id = 'wikipedia';
  public readonly displayName = 'Wikipedia';

  public async search(plan: ResearchQueryPlan, signal?: AbortSignal): Promise<RawResearchResult[]> {
    const endpoint = new URL('https://en.wikipedia.org/w/api.php');
    endpoint.searchParams.set('action', 'query');
    endpoint.searchParams.set('list', 'search');
    endpoint.searchParams.set('srsearch', plan.normalizedQuery);
    endpoint.searchParams.set('srlimit', String(Math.min(plan.maxResults, 6)));
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('origin', '*');

    const response = await fetch(endpoint.toString(), { headers: { Accept: 'application/json' }, signal });
    if (!response.ok) throw new Error(`Wikipedia search failed: HTTP ${response.status}`);

    const data = (await response.json()) as WikipediaSearchResponse;
    return (data.query?.search ?? []).map((item) => ({
      provider: this.id,
      providerSourceId: String(item.pageid),
      title: item.title,
      url: `https://en.wikipedia.org/?curid=${item.pageid}`,
      excerpt: item.snippet.replace(/<[^>]+>/g, ''),
      sourceType: 'ENCYCLOPEDIA' as const,
      metadata: { pageId: item.pageid },
    }));
  }
}
