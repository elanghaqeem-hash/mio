import { eventBus } from '../core/EventBus';
import { PolicyEngine } from '../security/PolicyEngine';
import { CitationManager } from './CitationManager';
import { ConflictDetector } from './ConflictDetector';
import { QueryPlanner } from './QueryPlanner';
import { SearchProvider } from './SearchProvider';
import { SourceEvaluator } from './SourceEvaluator';
import { CrossrefProvider } from './providers/CrossrefProvider';
import { MioResearchProxyProvider } from './providers/MioResearchProxyProvider';
import { WikipediaProvider } from './providers/WikipediaProvider';
import { ResearchReport, ResearchSource } from '../types/research';

export class ResearchEngine {
  private providers: SearchProvider[];

  constructor(providers: SearchProvider[] = ResearchEngine.defaultProviders()) {
    this.providers = providers;
  }

  private static defaultProviders(): SearchProvider[] {
    // Cloudflare web builds keep outbound retrieval behind a same-origin
    // function so secrets and the CSP boundary remain server-side. The
    // Electron preview has no Pages Functions runtime yet, so it retains the
    // public, secret-free providers until its main-process research IPC lands.
    return typeof window !== 'undefined' && window.mioDesktop
      ? [new WikipediaProvider(), new CrossrefProvider()]
      : [new MioResearchProxyProvider()];
  }

  public async research(query: string, signal?: AbortSignal): Promise<ResearchReport> {
    const plan = QueryPlanner.plan(query);
    if (!plan.normalizedQuery) throw new Error('Research query cannot be empty');
    if (signal?.aborted) throw new Error('Research cancelled');

    eventBus.emit('CORE_STATE_CHANGE', 'PROCESSING');

    const settled = await Promise.allSettled(this.providers.map(async (provider) => ({
      provider,
      ...(provider.searchWithDiagnostics
        ? await provider.searchWithDiagnostics(plan, signal)
        : { results: await provider.search(plan, signal), providerErrors: [] }),
    })));

    if (signal?.aborted) throw new Error('Research cancelled');

    const rawResults = settled.flatMap((item) => (item.status === 'fulfilled' ? item.value.results : []));
    const providerErrors = settled.flatMap((item, index) => {
      if (item.status === 'fulfilled') return item.value.providerErrors;
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

    if (signal?.aborted) throw new Error('Research cancelled');
    eventBus.emit('RESEARCH_COMPLETED', report);
    eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
    return report;
  }
}
