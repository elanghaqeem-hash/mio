import { RawResearchResult, ResearchQueryPlan } from '../types/research';

export interface SearchProviderResult {
  results: RawResearchResult[];
  providerErrors: Array<{ provider: string; error: string }>;
}

export interface SearchProvider {
  readonly id: string;
  readonly displayName: string;
  search(plan: ResearchQueryPlan, signal?: AbortSignal): Promise<RawResearchResult[]>;
  searchWithDiagnostics?(plan: ResearchQueryPlan, signal?: AbortSignal): Promise<SearchProviderResult>;
}
