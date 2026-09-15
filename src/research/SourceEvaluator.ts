import { EpistemicStatus } from '../agents/AntiHallucination';
import { RawResearchResult, SourceReliability } from '../types/research';

export interface SourceAssessment {
  reliability: SourceReliability;
  reliabilityScore: number;
  status: EpistemicStatus;
}

export class SourceEvaluator {
  public static assess(source: RawResearchResult): SourceAssessment {
    let score = 0.5;

    if (source.sourceType === 'ACADEMIC') score += 0.25;
    if (source.sourceType === 'DOCUMENTATION') score += 0.2;
    if (source.sourceType === 'ENCYCLOPEDIA') score += 0.12;
    if (source.authors && source.authors.length > 0) score += 0.05;
    if (source.publishedAt) score += 0.04;
    if (/^https:\/\//i.test(source.url)) score += 0.04;

    score = Math.max(0, Math.min(score, 0.99));

    let reliability: SourceReliability = 'UNVERIFIED';
    if (score >= 0.8) reliability = 'HIGH';
    else if (score >= 0.65) reliability = 'MODERATE';
    else if (score >= 0.5) reliability = 'LOW';

    const status: EpistemicStatus = score >= 0.85 ? 'CORROBORATED' : 'UNVERIFIED';
    return { reliability, reliabilityScore: score, status };
  }
}
