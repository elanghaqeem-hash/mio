import { ConflictDetector } from '../research/ConflictDetector';
import { ResearchSource } from '../types/research';

export function runResearchConflictTests(): { passed: number; total: number } {
  const base: Omit<ResearchSource, 'id' | 'sanitizedExcerpt'> = {
    provider: 'mock',
    providerSourceId: 'a',
    title: 'Shared Research Claim',
    url: 'https://example.test/a',
    excerpt: 'first interpretation',
    sourceType: 'DOCUMENTATION',
    reliability: 'HIGH',
    reliabilityScore: 0.9,
    status: 'CORROBORATED',
    suspicious: false,
    detectedThreats: [],
    citationLabel: '[1] Shared Research Claim',
  };

  const sources: ResearchSource[] = [
    { ...base, id: 'source-a', sanitizedExcerpt: 'first interpretation' },
    {
      ...base,
      id: 'source-b',
      providerSourceId: 'b',
      url: 'https://example.test/b',
      sanitizedExcerpt: 'materially different interpretation',
      citationLabel: '[2] Shared Research Claim',
    },
  ];

  const conflicts = ConflictDetector.detect(sources);
  return { passed: conflicts.length === 1 && conflicts[0].severity === 'WARNING' ? 1 : 0, total: 1 };
}
