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

  const now = 1;
  const project: MioProject = {
    id: 'proj_knowledge_test', name: 'Knowledge Test', description: '', createdAt: now, lastModified: now, activeMode: 'CHAT',
    references: [], versions: [], activityLog: [], securityLog: [],
    assets: [
      {
        id: 'asset_bcm_1', name: 'BCM Plan.md', type: 'document', origin: 'IMPORTED', version: 1, createdAt: now, updatedAt: now,
        filePath: 'workspace://ws_test/docs/bcm.md', verified: false,
        data: { content: '[UNTRUSTED_EXTERNAL_DATA]\nBusiness continuity recovery time objective and crisis response procedures.\n[/UNTRUSTED_EXTERNAL_DATA]', quarantine: true },
      },
      {
        id: 'asset_bcm_duplicate', name: 'BCM Copy.md', type: 'document', origin: 'IMPORTED', version: 1, createdAt: now, updatedAt: now,
        filePath: 'workspace://ws_test/docs/bcm-copy.md', verified: false,
        data: { content: '[UNTRUSTED_EXTERNAL_DATA]\nBusiness continuity recovery time objective and crisis response procedures.\n[/UNTRUSTED_EXTERNAL_DATA]', quarantine: true },
      },
      {
        id: 'asset_finance', name: 'Budget.txt', type: 'document', origin: 'IMPORTED', version: 1, createdAt: now, updatedAt: now,
        filePath: 'workspace://ws_test/docs/budget.txt', verified: true,
        data: { content: 'Annual budget assumptions, operating expense baseline, and revenue forecast.' },
      },
    ],
  };

  const chunks = ProjectKnowledgeIndex.build(project);
  check(chunks.length === 2, 'Exact duplicate knowledge chunks are removed by deterministic content fingerprint');
  check(chunks.some((chunk) => chunk.trust === 'QUARANTINED') && chunks.some((chunk) => chunk.trust === 'VERIFIED'), 'Knowledge chunks preserve asset trust state');
  check(chunks.every((chunk) => chunk.sourceUri.startsWith('workspace://')), 'Knowledge chunks preserve scoped source lineage');

  const bcm = ProjectKnowledgeIndex.retrieve(project, 'What is the recovery time objective in the business continuity plan?');
  check(bcm.hits.length >= 1 && bcm.hits[0].assetId === 'asset_bcm_1', 'Lexical retrieval ranks the relevant project document for the query');
  check(bcm.contextText.includes('UNTRUSTED_PROJECT_CONTEXT') && bcm.contextText.includes('trust="QUARANTINED"'), 'Retrieved context is explicitly marked as untrusted data with trust metadata');
  check(bcm.contextText.includes('assetId="asset_bcm_1"') && bcm.contextText.includes('workspace://ws_test/docs/bcm.md'), 'Retrieved context carries asset and source URI attribution');
  check(bcm.applicationContext?.kind === 'PROJECT_KNOWLEDGE' && bcm.applicationContext.policy === 'DATA_ONLY', 'Retrieval produces a typed DATA_ONLY application context envelope');
  check(bcm.applicationContext?.sources[0].assetId === 'asset_bcm_1' && bcm.applicationContext.sources[0].trust === 'QUARANTINED', 'Typed context preserves source identity and trust state');

  const excluded = ProjectKnowledgeIndex.retrieve(project, 'business continuity recovery time objective', { excludedAssetIds: ['asset_bcm_1'] });
  check(excluded.hits.every((hit) => hit.assetId !== 'asset_bcm_1'), 'Explicit source exclusion removes an asset from future retrieval');

  const irrelevant = ProjectKnowledgeIndex.retrieve(project, 'quantum telescope galaxy nebula');
  check(irrelevant.hits.length === 0 && irrelevant.contextText === '' && irrelevant.applicationContext === undefined, 'Irrelevant queries do not inject unrelated project documents into model context');

  const bounded = ProjectKnowledgeIndex.retrieve(project, 'budget revenue operating expense', 1);
  check(bounded.hits.length === 1 && bounded.hits[0].assetId === 'asset_finance', 'Retrieval result count is bounded and respects relevance ranking');

  const budgetBounded = ProjectKnowledgeIndex.retrieve(project, 'business continuity recovery time objective', { contextBudgetChars: 600 });
  check((budgetBounded.applicationContext?.contextBudgetChars ?? 0) === 600, 'Retrieval records the active project context character budget');
  check((budgetBounded.applicationContext?.sources.reduce((sum, source) => sum + source.text.length, 0) ?? 0) <= 1200, 'Context payload remains bounded even when the first relevant chunk exceeds the nominal minimum budget');

  return { passed, total };
}
