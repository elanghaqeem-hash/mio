import { ResearchQueryPlan } from '../types/research';

export class QueryPlanner {
  public static plan(query: string, maxResults: number = 8): ResearchQueryPlan {
    const normalizedQuery = query.trim().replace(/\s+/g, ' ');
    const lower = normalizedQuery.toLowerCase();
    const intents = new Set<ResearchQueryPlan['intents'][number]>();

    intents.add('GENERAL');
    if (/paper|journal|study|research|doi|academic|scientific/.test(lower)) intents.add('ACADEMIC');
    if (/api|sdk|documentation|framework|library|protocol|standard|specification/.test(lower)) intents.add('TECHNICAL');
    if (/latest|recent|today|current|202[5-9]/.test(lower)) intents.add('CURRENT');

    return {
      originalQuery: query,
      normalizedQuery,
      intents: Array.from(intents),
      maxResults: Math.max(1, Math.min(maxResults, 20)),
    };
  }
}
