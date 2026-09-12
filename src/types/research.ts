import { EpistemicStatus } from '../agents/AntiHallucination';

export type SourceReliability = 'HIGH' | 'MODERATE' | 'LOW' | 'UNVERIFIED';

export interface ResearchQueryPlan {
  originalQuery: string;
  normalizedQuery: string;
  intents: Array<'GENERAL' | 'ACADEMIC' | 'TECHNICAL' | 'CURRENT'>;
  maxResults: number;
}

export interface RawResearchResult {
  provider: string;
  providerSourceId: string;
  title: string;
  url: string;
  excerpt: string;
  authors?: string[];
  publishedAt?: string;
  sourceType: 'ENCYCLOPEDIA' | 'ACADEMIC' | 'DOCUMENTATION' | 'WEB';
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ResearchSource extends RawResearchResult {
  id: string;
  reliability: SourceReliability;
  reliabilityScore: number;
  status: EpistemicStatus;
  sanitizedExcerpt: string;
  suspicious: boolean;
  detectedThreats: string[];
  citationLabel: string;
}

export interface ResearchConflict {
  id: string;
  sourceIds: string[];
  description: string;
  severity: 'INFO' | 'WARNING';
}

export interface ResearchReport {
  query: ResearchQueryPlan;
  sources: ResearchSource[];
  conflicts: ResearchConflict[];
  generatedAt: number;
  providerErrors: Array<{ provider: string; error: string }>;
}
