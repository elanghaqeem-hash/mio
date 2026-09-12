import { KnowledgeGovernanceWorkflow } from '../project/KnowledgeGovernanceWorkflow';
import { KnowledgeHealth } from '../project/KnowledgeHealth';
import { KnowledgeLineage } from '../project/KnowledgeLineage';
import { ProjectKnowledgeIndex } from '../project/ProjectKnowledgeIndex';
import { KnowledgeQueryDiagnostics } from '../project/KnowledgeQueryDiagnostics';
import { ProjectManager } from '../project/ProjectManager';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { MioProject } from '../types/project';

interface SuiteResult { passed: number; total: number; }

export async function runKnowledgeLineageDiagnosticsTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`KnowledgeLineageDiagnostics test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const storage = new InMemoryStorageProvider();
  ProjectManager.setStorageProvider(storage);
  await ProjectManager.initialize();
  ProjectManager.createProject('TP 0.21 Lineage Diagnostics Test');
  const now = Date.now();
  const sourceA = ProjectManager.addAsset({ name: 'BCM Policy A.md', type: 'document', origin: 'IMPORTED', filePath: 'workspace://lineage/a.md', data: { content: 'Business continuity recovery objective requires service restoration within 4 hours after disruption.' }, verified: false });
  const sourceB = ProjectManager.addAsset({ name: 'BCM Policy B.md', type: 'document', origin: 'IMPORTED', filePath: 'workspace://lineage/b.md', data: { content: 'Business continuity recovery objective defines critical service restoration within four hours after disruption.' }, verified: false });
  const sourceC = ProjectManager.addAsset({ name: 'BCM Procedure C.md', type: 'document', origin: 'IMPORTED', filePath: 'workspace://lineage/c.md', data: { content: 'Business continuity recovery procedure requires incident commander escalation and service restoration tracking.' }, verified: false });
  for (const source of [sourceA, sourceB, sourceC]) ProjectManager.reviewKnowledgeSource(source.id, 'VERIFIED', 'TP 0.21 review', now + 86_400_000);

  check(!KnowledgeLineage.update(sourceA.id, { derivedFromAssetIds: [sourceA.id] }), 'Lineage workflow rejects self-dependency');
  check(KnowledgeLineage.update(sourceA.id, { upstreamSourceKey: 'group-policy-master', note: 'Imported copy of approved group policy' }), 'User can declare explicit upstream identity for a project source');
  check(KnowledgeLineage.update(sourceB.id, { upstreamSourceKey: 'group-policy-master', derivedFromAssetIds: [sourceA.id], note: 'Localized derivative' }), 'User can declare a derivative source with the same upstream family');
  check(!KnowledgeLineage.update(sourceA.id, { derivedFromAssetIds: [sourceB.id] }), 'Lineage graph rejects dependency cycles');
  check(KnowledgeLineage.shareFamily(ProjectManager.getProject(), sourceA.id, sourceB.id), 'Sources with shared explicit upstream identity are recognized as the same lineage family');

  const groupId = KnowledgeGovernanceWorkflow.createCorroborationGroup('BCM duplicated upstream group', [sourceA.id, sourceB.id]);
  check(Boolean(groupId), 'User can still record a human-declared corroboration group for same-lineage sources');
  const sameLineageHealth = KnowledgeHealth.evaluate(ProjectManager.getProject());
  check(sameLineageHealth.evidenceStrength === 'MIXED' && sameLineageHealth.lineageOverlapGroups >= 1, 'Same-lineage corroboration group does not inflate evidence strength to CORROBORATED');

  check(KnowledgeLineage.update(sourceB.id, { upstreamSourceKey: 'independent-audit-source', note: 'Separately originated source after lineage review' }), 'Explicit lineage review can move a source to a distinct upstream family');
  const independentHealth = KnowledgeHealth.evaluate(ProjectManager.getProject());
  check(independentHealth.evidenceStrength === 'CORROBORATED' && independentHealth.independentCorroborationGroups >= 1, 'Explicit corroboration becomes CORROBORATED only when declared sources have distinct lineage families');

  const queryContext = ProjectKnowledgeIndex.retrieve(ProjectManager.getProject(), 'business continuity recovery service restoration disruption', { limit: 5 });
  const diagnostics = KnowledgeQueryDiagnostics.evaluate(ProjectManager.getProject(), queryContext);
  check(diagnostics.method === 'TRANSPARENT_RETRIEVAL_DIAGNOSTIC' && diagnostics.selectedSourceCount >= 2, 'Query diagnostics transparently describe the selected retrieval set');
  check(diagnostics.lineageDiversity === 'MULTI_LINEAGE' && diagnostics.independentLineageCount >= 2, 'Query diagnostics distinguish multi-lineage evidence from duplicated lineage');
  check(diagnostics.sources.every((source) => Math.abs(source.finalScore - (source.lexicalScore + source.trustAdjustment + source.freshnessAdjustment + source.priorityAdjustment)) < 0.001), 'Retrieval diagnostic score is decomposed into transparent bounded components');

  ProjectManager.setKnowledgeSourcePriority(sourceC.id, 'PRIMARY');
  const irrelevant = ProjectKnowledgeIndex.retrieve(ProjectManager.getProject(), 'quantum satellite propulsion telemetry');
  check(!irrelevant.hits.some((hit) => hit.assetId === sourceC.id), 'Lineage and PRIMARY metadata cannot create relevance for an unrelated query');

  await ProjectManager.flush();
  const persisted = await storage.get<MioProject>('projects', 'current-project');
  check(persisted?.knowledgeGovernance.sources[sourceB.id]?.lineage?.upstreamSourceKey === 'independent-audit-source', 'Lineage metadata survives project storage persistence round-trip');
  check(persisted?.knowledgeGovernance.history.some((event) => event.action === 'LINEAGE_UPDATED' && event.assetId === sourceB.id) === true, 'Lineage decisions persist in governance provenance history');

  return { passed, total };
}
