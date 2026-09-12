import { SearchProvider } from '../SearchProvider';
import { RawResearchResult, ResearchQueryPlan } from '../../types/research';

interface CrossrefWork {
  DOI?: string;
  URL?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string }>;
  published?: { 'date-parts'?: number[][] };
  abstract?: string;
  publisher?: string;
}

interface CrossrefResponse {
  message?: { items?: CrossrefWork[] };
}

export class CrossrefProvider implements SearchProvider {
  public readonly id = 'crossref';
  public readonly displayName = 'Crossref';

  public async search(plan: ResearchQueryPlan, signal?: AbortSignal): Promise<RawResearchResult[]> {
    const endpoint = new URL('https://api.crossref.org/works');
    endpoint.searchParams.set('query.bibliographic', plan.normalizedQuery);
    endpoint.searchParams.set('rows', String(Math.min(plan.maxResults, 6)));
    endpoint.searchParams.set('select', 'DOI,URL,title,author,published,abstract,publisher');

    const response = await fetch(endpoint.toString(), { headers: { Accept: 'application/json' }, signal });
    if (!response.ok) throw new Error(`Crossref search failed: HTTP ${response.status}`);

    const data = (await response.json()) as CrossrefResponse;
    return (data.message?.items ?? []).map((item, index) => {
      const dateParts = item.published?.['date-parts']?.[0];
      const publishedAt = dateParts?.length ? dateParts.join('-') : undefined;
      const authors = (item.author ?? [])
        .map((author) => [author.given, author.family].filter(Boolean).join(' '))
        .filter(Boolean);
      const doi = item.DOI ?? `crossref-${index}`;

      return {
        provider: this.id,
        providerSourceId: doi,
        title: item.title?.[0] ?? doi,
        url: item.URL ?? (item.DOI ? `https://doi.org/${item.DOI}` : 'https://www.crossref.org/'),
        excerpt: (item.abstract ?? `Academic work indexed by Crossref${item.publisher ? `; publisher: ${item.publisher}` : ''}`)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
        authors,
        publishedAt,
        sourceType: 'ACADEMIC' as const,
        metadata: { doi: item.DOI ?? null, publisher: item.publisher ?? null },
      };
    });
  }
}
