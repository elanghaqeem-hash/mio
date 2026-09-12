import { EvidenceGrounding } from '../intelligence/EvidenceGrounding';
import { ProjectKnowledgeIndex } from '../project/ProjectKnowledgeIndex';
import type { MioProject } from '../types/project';

interface SuiteResult { passed: number; total: number; }

export async function runProjectKnowledgeIndexTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`ProjectKnowledgeIndex test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const now = Date.now();
  const project: MioProject = {
    id: 'proj_knowledge_test', name: 'Knowledge Test', description: '', createdAt: now, lastModified: now, activeMode: 'CHAT',
    references: [], versions: [], activityLog: [], securityLog: [],
    knowledgeGovernance: {
      updatedAt: now,
      history: [],
      sources: {
        asset_bcm_1: { assetId: 'asset_bcm_1', included: true, trust: 'VERIFIED', reviewedAt: now, freshUntil: now + 86_400_000, updatedAt: now },
        asset_bcm_duplicate: { assetId: 'asset_bcm_duplicate', included: true, trust: 'QUARANTINED', updatedAt: now },
        asset_finance: { assetId: 'asset_finance', included: true, trust: 'VERIFIED', reviewedAt: now - 1000, freshUntil: now - 1, updatedAt: now },
      },
    },
    assets: [
      { id: 'asset_bcm_1', name: 'BCM Plan.md', type: 'document', origin: 'IMPORTED', version: 1, createdAt: now, updatedAt: now, filePath: 'workspace://ws_test/docs/bcm.md', verified: false, data: { content: '[UNTRUSTED_EXTERNAL_DATA]\nBusiness continuity recovery time objective is four hours and crisis response procedures require escalation.\n[/UNTRUSTED_EXTERNAL_DATA]', quarantine: true } },
      { id: 'asset_bcm_duplicate', name: 'BCM Copy.md', type: 'document', origin: 'IMPORTED', version: 1, createdAt: now, updatedAt: now, filePath: 'workspace://ws_test/docs/bcm-copy.md', verified: false, data: { content: '[UNTRUSTED_EXTERNAL_DATA]\nBusiness continuity recovery time objective is four hours and crisis response procedures require escalation.\n[/UNTRUSTED_EXTERNAL_DATA]', quarantine: true } },
      { id: 'asset_finance', name: 'Budget.txt', type: 'document', origin: 'IMPORTED', version: 1, createdAt: now, updatedAt: now, filePath: 'workspace://ws_test/docs/budget.txt', verified: true, data: { content: 'Annual budget assumptions, operating expense baseline, and revenue forecast.' } },
    ],
  };

  const chunks = ProjectKnowledgeIndex.build(project);
  check(chunks.length === 2, 'Exact duplicate knowledge chunks are removed by deterministic content fingerprint');
  check(chunks.some((chunk) => chunk.assetId === 'asset_bcm_1' && chunk.trust === 'VERIFIED'), 'Persistent governance review can promote source trust independently of original imported flag');
  check(chunks.some((chunk) => chunk.assetId === 'asset_bcm_1' && chunk.freshness === 'CURRENT'), 'Freshness metadata marks reviewed source CURRENT before fresh-until boundary');
  check(chunks.some((chunk) => chunk.assetId === 'asset_finance' && chunk.freshness === 'STALE'), 'Expired freshness boundary is surfaced as STALE');
  check(chunks.every((chunk) => chunk.sourceUri.startsWith('workspace://')), 'Knowledge chunks preserve scoped source lineage');

  const bcm = ProjectKnowledgeIndex.retrieve(project, 'What is the recovery time objective in the business continuity plan?');
  check(bcm.hits.length >= 1 && bcm.hits[0].assetId === 'asset_bcm_1', 'Lexical retrieval ranks the relevant project document for the query');
  check(bcm.contextText.includes('UNTRUSTED_PROJECT_CONTEXT') && bcm.contextText.includes('trust="VERIFIED"'), 'Retrieved context is explicitly marked as untrusted data while preserving reviewed trust metadata');
  check(bcm.contextText.includes('freshness="CURRENT"'), 'Serialized project context exposes source freshness state');
  check(bcm.contextText.includes('assetId="asset_bcm_1"') && bcm.contextText.includes('workspace://ws_test/docs/bcm.md'), 'Retrieved context carries asset and source URI attribution');
  check(bcm.applicationContext?.kind === 'PROJECT_KNOWLEDGE' && bcm.applicationContext.policy === 'DATA_ONLY', 'Retrieval produces a typed DATA_ONLY application context envelope');
  check(bcm.applicationContext?.sources[0].assetId === 'asset_bcm_1' && bcm.applicationContext.sources[0].freshness === 'CURRENT', 'Typed context preserves governance freshness and source identity');

  project.knowledgeGovernance.sources.asset_bcm_1.included = false;
  const persistentExcluded = ProjectKnowledgeIndex.retrieve(project, 'business continuity recovery time objective');
  check(persistentExcluded.hits.every((hit) => hit.assetId !== 'asset_bcm_1'), 'Persistent governance exclusion removes source without relying on chat-session state');
  project.knowledgeGovernance.sources.asset_bcm_1.included = true;

  project.knowledgeGovernance.sources.asset_bcm_1.supersededByAssetId = 'asset_finance';
  const superseded = ProjectKnowledgeIndex.retrieve(project, 'business continuity recovery time objective');
  check(superseded.hits.every((hit) => hit.assetId !== 'asset_bcm_1'), 'Superseded source is removed from active retrieval');
  delete project.knowledgeGovernance.sources.asset_bcm_1.supersededByAssetId;

  const excluded = ProjectKnowledgeIndex.retrieve(project, 'business continuity recovery time objective', { excludedAssetIds: ['asset_bcm_1'] });
  check(excluded.hits.every((hit) => hit.assetId !== 'asset_bcm_1'), 'Explicit session source exclusion still composes with persistent governance');

  const irrelevant = ProjectKnowledgeIndex.retrieve(project, 'quantum telescope galaxy nebula');
  check(irrelevant.hits.length === 0 && irrelevant.contextText === '' && irrelevant.applicationContext === undefined, 'Irrelevant queries do not inject unrelated project documents into model context');

  const bounded = ProjectKnowledgeIndex.retrieve(project, 'budget revenue operating expense', 1);
  check(bounded.hits.length === 1 && bounded.hits[0].assetId === 'asset_finance', 'Retrieval result count is bounded and respects relevance ranking');

  const budgetBounded = ProjectKnowledgeIndex.retrieve(project, 'business continuity recovery time objective', { contextBudgetChars: 600 });
  check((budgetBounded.applicationContext?.contextBudgetChars ?? 0) === 600, 'Retrieval records the active project context character budget');
  check((budgetBounded.applicationContext?.sources.reduce((sum, source) => sum + source.text.length, 0) ?? 0) <= 1200, 'Context payload remains bounded even when the first relevant chunk exceeds the nominal minimum budget');

  const audit = EvidenceGrounding.audit('The recovery time objective is four hours. Saturn has rings made of ice. Escalation is required.', bcm.applicationContext);
  check(audit.method === 'LEXICAL_EVIDENCE_HEURISTIC', 'Evidence audit identifies its bounded heuristic method truthfully');
  check(audit.supported >= 1, 'Evidence audit marks claims with multiple source-term overlaps as SUPPORTED');
  check(audit.unsupported >= 1, 'Evidence audit surfaces response claims without source support as UNSUPPORTED');
  check(audit.claims.some((claim) => claim.evidence.some((item) => item.assetId === 'asset_bcm_1')), 'Evidence claims preserve source lineage back to governed project asset');

  return { passed, total };
}
