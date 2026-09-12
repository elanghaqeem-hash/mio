import { RawResearchResult, ResearchQueryPlan } from '../types/research';

export interface SearchProvider {
  readonly id: string;
  readonly displayName: string;
  search(plan: ResearchQueryPlan, signal?: AbortSignal): Promise<RawResearchResult[]>;
}
