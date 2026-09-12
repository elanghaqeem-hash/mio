import { eventBus } from '../core/EventBus';
import { PolicyEngine } from '../security/PolicyEngine';
import { CitationManager } from './CitationManager';
import { ConflictDetector } from './ConflictDetector';
import { QueryPlanner } from './QueryPlanner';
import { SearchProvider } from './SearchProvider';
import { SourceEvaluator } from './SourceEvaluator';
import { CrossrefProvider } from './providers/CrossrefProvider';
import { WikipediaProvider } from './providers/WikipediaProvider';
import { ResearchReport, ResearchSource } from '../types/research';

export class ResearchEngine {
  private providers: SearchProvider[];

  constructor(providers: SearchProvider[] = [new WikipediaProvider(), new CrossrefProvider()]) {
    this.providers = providers;
  }

  public async research(query: string): Promise<ResearchReport> {
    const plan = QueryPlanner.plan(query);
    if (!plan.normalizedQuery) {
      throw new Error('Research query cannot be empty');
    }

    eventBus.emit('CORE_STATE_CHANGE', 'PROCESSING');

    const settled = await Promise.allSettled(
      this.providers.map(async (provider) => ({ provider, results: await provider.search(plan) }))
    );

    const rawResults = settled.flatMap((item) => (item.status === 'fulfilled' ? item.value.results : []));
    const providerErrors = settled.flatMap((item, index) => {
      if (item.status === 'fulfilled') return [];
      return [{ provider: this.providers[index]?.id ?? `provider_${index}`, error: String(item.reason) }];
    });

    const seen = new Set<string>();
    const deduped = rawResults.filter((item) => {
      const key = `${item.url}|${item.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const sources: ResearchSource[] = deduped.slice(0, plan.maxResults).map((raw, index) => {
      const safety = PolicyEngine.sanitizeExternalContent(raw.excerpt, `${raw.provider}:${raw.url}`);
      const assessment = SourceEvaluator.assess(raw);
      return {
        ...raw,
        id: `source_${index + 1}_${raw.provider}`,
        reliability: assessment.reliability,
        reliabilityScore: assessment.reliabilityScore,
        status: safety.suspicious ? 'UNVERIFIED' : assessment.status,
        sanitizedExcerpt: safety.sanitized,
        suspicious: safety.suspicious,
        detectedThreats: safety.detectedThreats,
        citationLabel: CitationManager.label(raw, index),
      };
    });

    const report: ResearchReport = {
      query: plan,
      sources,
      conflicts: ConflictDetector.detect(sources),
      generatedAt: Date.now(),
      providerErrors,
    };

    eventBus.emit('RESEARCH_COMPLETED', report);
    eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
    return report;
  }
}
