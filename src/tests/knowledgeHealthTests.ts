import { KnowledgeHealth } from '../project/KnowledgeHealth';
import { ProjectKnowledgeIndex } from '../project/ProjectKnowledgeIndex';
import type { MioProject, ProjectAsset } from '../types/project';

interface SuiteResult { passed: number; total: number; }

function document(id: string, name: string, content: string, now: number): ProjectAsset {
  return { id, name, type: 'document', origin: 'IMPORTED', version: 1, createdAt: now, updatedAt: now, filePath: `workspace://health/${id}.md`, data: { content }, verified: true };
}

function projectWith(assets: ProjectAsset[], now: number): MioProject {
  return {
    id: 'proj_health', name: 'Knowledge Health', description: '', createdAt: now, lastModified: now, activeMode: 'PROJECT',
    assets, references: [], versions: [], activityLog: [], securityLog: [],
    knowledgeGovernance: {
      updatedAt: now,
      history: [],
      sources: Object.fromEntries(assets.map((asset) => [asset.id, { assetId: asset.id, included: true, trust: 'VERIFIED' as const, priority: 'STANDARD' as const, reviewedAt: now, freshUntil: now + 86_400_000, updatedAt: now }])),
    },
  };
}

export async function runKnowledgeHealthTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`KnowledgeHealth test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const now = Date.now();
  const empty = projectWith([], now);
  const emptyHealth = KnowledgeHealth.evaluate(empty);
  check(emptyHealth.healthScore === 0 && emptyHealth.confidence === 'LOW', 'Empty project reports bounded LOW knowledge health instead of fabricated confidence');

  const healthy = projectWith([document('healthy', 'BCM Policy', 'Business continuity policy requires annual recovery testing.', now)], now);
  const healthySummary = KnowledgeHealth.evaluate(healthy);
  check(healthySummary.healthScore === 100 && healthySummary.confidence === 'HIGH', 'Verified current source can achieve transparent high health score');

  healthy.knowledgeGovernance.sources.healthy.trust = 'QUARANTINED';
  delete healthy.knowledgeGovernance.sources.healthy.freshUntil;
  const reviewDebt = KnowledgeHealth.evaluate(healthy);
  check(reviewDebt.reviewRequiredSources === 1 && reviewDebt.healthScore < healthySummary.healthScore, 'Quarantine and unknown freshness lower project health and create review debt');

  const numeric = projectWith([
    document('rto_a', 'BCM Standard A', 'Business continuity recovery time objective is 4 hours for critical service recovery.', now),
    document('rto_b', 'BCM Standard B', 'Business continuity recovery time objective is 8 hours for critical service recovery.', now),
  ], now);
  const numericHealth = KnowledgeHealth.evaluate(numeric);
  check(numericHealth.potentialConflicts.some((item) => item.reason === 'NUMERIC_MISMATCH'), 'Shared-topic documents with disjoint numeric signals are surfaced as POTENTIAL_CONFLICT');

  const unrelated = projectWith([
    document('finance', 'Budget', 'Annual operating budget revenue forecast is 100 million.', now),
    document('security', 'Access Policy', 'Privileged access approval requires two independent reviewers.', now),
  ], now);
  check(KnowledgeHealth.evaluate(unrelated).potentialConflicts.length === 0, 'Unrelated documents do not create conflict solely because both contain numbers');

  const ranked = projectWith([
    document('standard', 'Recovery Standard', 'Recovery objective for core banking service is four hours baseline.', now),
    document('primary', 'Recovery Primary', 'Recovery objective for core banking service is four hours authoritative baseline.', now),
    document('irrelevant', 'Primary Astronomy', 'Nebula telescope galaxy observation catalog.', now),
  ], now);
  ranked.knowledgeGovernance.sources.primary.priority = 'PRIMARY';
  ranked.knowledgeGovernance.sources.irrelevant.priority = 'PRIMARY';
  const retrieval = ProjectKnowledgeIndex.retrieve(ranked, 'core banking recovery objective', 3);
  check(retrieval.hits[0]?.assetId === 'primary', 'PRIMARY source outranks equally relevant STANDARD source after lexical relevance exists');
  check(retrieval.hits.every((hit) => hit.assetId !== 'irrelevant'), 'PRIMARY governance priority cannot create relevance for an unrelated source');
  check(retrieval.applicationContext?.sources[0].priority === 'PRIMARY' && retrieval.contextText.includes('priority="PRIMARY"'), 'Priority metadata is carried transparently into DATA_ONLY application context');

  return { passed, total };
}
