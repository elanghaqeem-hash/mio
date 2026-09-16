import { MioBenchDomain, MioBenchReport } from './MioBench';
import { MioModelManifest, validateModelManifest } from './ModelManifest';

export interface ModelPromotionDecision {
  allowed: boolean;
  reasons: string[];
  metrics: {
    passRate: number;
    scoreRatio: number;
    averageLatencyMs: number;
    coveredDomains: MioBenchDomain[];
  };
}

export function evaluateModelPromotion(manifest: MioModelManifest, report: MioBenchReport): ModelPromotionDecision {
  const reasons: string[] = [];
  const validation = validateModelManifest(manifest);
  if (!validation.valid) reasons.push(...validation.errors.map((error) => `Manifest: ${error}`));

  if (manifest.lifecycle !== 'RELEASE_CANDIDATE') reasons.push('Model must be in RELEASE_CANDIDATE lifecycle before promotion');
  if (!manifest.review.dataGovernanceReviewed) reasons.push('Data-governance review is incomplete');
  if (!manifest.review.securityReviewed) reasons.push('Security review is incomplete');
  if (report.model !== manifest.runtimeModel) reasons.push(`Benchmark model '${report.model}' does not match manifest runtimeModel '${manifest.runtimeModel}'`);
  if (report.generatedAt < manifest.createdAt) reasons.push('Benchmark report predates the model manifest');

  const passRate = report.passRate;
  const scoreRatio = report.maxScore > 0 ? report.score / report.maxScore : 0;
  const averageLatencyMs = report.results.length > 0
    ? report.results.reduce((sum, result) => sum + result.latencyMs, 0) / report.results.length
    : Number.POSITIVE_INFINITY;
  const coveredDomains = [...new Set(report.results.filter((result) => result.passed).map((result) => result.domain))];

  if (passRate < manifest.benchmarkPolicy.minPassRate) {
    reasons.push(`Pass rate ${passRate.toFixed(3)} is below required ${manifest.benchmarkPolicy.minPassRate.toFixed(3)}`);
  }
  if (scoreRatio < manifest.benchmarkPolicy.minScoreRatio) {
    reasons.push(`Score ratio ${scoreRatio.toFixed(3)} is below required ${manifest.benchmarkPolicy.minScoreRatio.toFixed(3)}`);
  }
  for (const domain of manifest.benchmarkPolicy.requiredDomains) {
    if (!coveredDomains.includes(domain)) reasons.push(`Required benchmark domain '${domain}' has no passing result`);
  }
  if (manifest.benchmarkPolicy.maxAverageLatencyMs !== undefined && averageLatencyMs > manifest.benchmarkPolicy.maxAverageLatencyMs) {
    reasons.push(`Average latency ${Math.round(averageLatencyMs)}ms exceeds ${manifest.benchmarkPolicy.maxAverageLatencyMs}ms`);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    metrics: { passRate, scoreRatio, averageLatencyMs, coveredDomains },
  };
}

export function promoteManifest(manifest: MioModelManifest, report: MioBenchReport, reviewer: string): MioModelManifest {
  const decision = evaluateModelPromotion(manifest, report);
  if (!decision.allowed) throw new Error(`Model promotion blocked: ${decision.reasons.join('; ')}`);
  return {
    ...manifest,
    lifecycle: 'PROMOTED',
    review: {
      ...manifest.review,
      reviewer: reviewer.trim().slice(0, 200) || manifest.review.reviewer,
      reviewedAt: Date.now(),
    },
  };
}
