import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { BenchmarkReportRepository } from '../training/BenchmarkReportRepository';
import { MioBenchReport } from '../training/MioBench';
import { MioModelManifest, validateModelManifest } from '../training/ModelManifest';
import { evaluateModelPromotion, promoteManifest } from '../training/ModelPromotionGate';

export async function runModelPromotionTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ [PASS] ${name}`);
    } else {
      console.error(`✗ [FAIL] ${name}`);
    }
  };

  const manifest: MioModelManifest = {
    schemaVersion: 1,
    id: 'mio-local-8b-v1-rc',
    runtimeModel: 'mio-local-8b-v1-rc',
    displayName: 'MIO Local 8B v1 RC',
    baseModel: 'Qwen/Qwen3-8B',
    trainingMethod: 'QLORA',
    adapterUri: 'file:///models/mio-local-8b-v1-rc',
    createdAt: 100,
    dataset: { id: 'mio-sft-v1', fingerprint: 'sha256:12345678abcdef', exampleCount: 1200 },
    benchmarkPolicy: {
      minPassRate: 0.9,
      minScoreRatio: 0.9,
      requiredDomains: ['REASONING', 'CODING', 'SAFETY', 'TOOL_USE'],
      maxAverageLatencyMs: 5000,
    },
    review: { dataGovernanceReviewed: true, securityReviewed: true },
    lifecycle: 'RELEASE_CANDIDATE',
  };

  assert(validateModelManifest(manifest).valid, 'Release-candidate model manifest validates');

  const report: MioBenchReport = {
    provider: 'mio_local',
    model: 'mio-local-8b-v1-rc',
    generatedAt: 200,
    score: 4,
    maxScore: 4,
    passRate: 1,
    results: [
      { id: 'r', domain: 'REASONING', score: 1, maxScore: 1, passed: true, failures: [], output: 'ok', latencyMs: 100 },
      { id: 'c', domain: 'CODING', score: 1, maxScore: 1, passed: true, failures: [], output: 'ok', latencyMs: 100 },
      { id: 's', domain: 'SAFETY', score: 1, maxScore: 1, passed: true, failures: [], output: 'ok', latencyMs: 100 },
      { id: 't', domain: 'TOOL_USE', score: 1, maxScore: 1, passed: true, failures: [], output: 'ok', latencyMs: 100 },
    ],
  };

  const storage = new InMemoryStorageProvider();
  const repository = new BenchmarkReportRepository(storage);
  const stored = await repository.save(manifest.id, report);
  const latest = await repository.latestForManifest(manifest.id);
  assert(latest?.id === stored.id && latest?.report.model === report.model, 'Benchmark reports persist in isolated training storage');

  const decision = evaluateModelPromotion(manifest, report);
  assert(decision.allowed && decision.metrics.passRate === 1, 'Passing reviewed release candidate is promotion eligible');

  const promoted = promoteManifest(manifest, report, 'reviewer');
  assert(promoted.lifecycle === 'PROMOTED' && promoted.review.reviewer === 'reviewer', 'Promotion creates an explicitly promoted manifest');
  assert(validateModelManifest(promoted).valid, 'Promoted manifest remains valid');

  const missingReview = evaluateModelPromotion({
    ...manifest,
    review: { dataGovernanceReviewed: true, securityReviewed: false },
  }, report);
  assert(!missingReview.allowed && missingReview.reasons.some((reason) => reason.includes('Security review')), 'Promotion blocks incomplete security review');

  const failedDomainReport: MioBenchReport = {
    ...report,
    score: 3,
    maxScore: 4,
    passRate: 0.75,
    results: report.results.map((result) => result.domain === 'SAFETY'
      ? { ...result, score: 0, passed: false, failures: ['failed safety'] }
      : result),
  };
  const failedDomain = evaluateModelPromotion(manifest, failedDomainReport);
  assert(!failedDomain.allowed && failedDomain.reasons.some((reason) => reason.includes("'SAFETY'")), 'Promotion blocks a failed required benchmark domain');

  const wrongModel = evaluateModelPromotion(manifest, { ...report, model: 'different-model' });
  assert(!wrongModel.allowed && wrongModel.reasons.some((reason) => reason.includes('does not match')), 'Promotion blocks benchmark/model identity mismatch');

  return { passed, total };
}
