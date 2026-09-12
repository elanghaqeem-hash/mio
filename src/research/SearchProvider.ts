import { RawResearchResult, ResearchQueryPlan } from '../types/research';

export interface SearchProvider {
  readonly id: string;
  readonly displayName: string;
  search(plan: ResearchQueryPlan): Promise<RawResearchResult[]>;
}
