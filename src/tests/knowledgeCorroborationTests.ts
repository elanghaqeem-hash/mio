import { KnowledgeGovernanceWorkflow } from '../project/KnowledgeGovernanceWorkflow';
import { KnowledgeHealth } from '../project/KnowledgeHealth';
import { ProjectManager } from '../project/ProjectManager';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { MioProject } from '../types/project';

interface SuiteResult { passed: number; total: number; }

export async function runKnowledgeCorroborationTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`KnowledgeCorroboration test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const storage = new InMemoryStorageProvider();
  ProjectManager.setStorageProvider(storage);
  await ProjectManager.initialize();
  ProjectManager.createProject('TP 0.20 Corroboration Test');
  const now = Date.now();
  const sourceA = ProjectManager.addAsset({ name: 'BCM A.md', type: 'document', origin: 'IMPORTED', filePath: 'workspace://corroboration/a.md', data: { content: 'Business continuity recovery time objective is 4 hours for critical service recovery.' }, verified: false });
  const sourceB = ProjectManager.addAsset({ name: 'BCM B.md', type: 'document', origin: 'IMPORTED', filePath: 'workspace://corroboration/b.md', data: { content: 'Business continuity recovery time objective is 8 hours for critical service recovery.' }, verified: false });
  const sourceC = ProjectManager.addAsset({ name: 'BCM C.md', type: 'document', origin: 'IMPORTED', filePath: 'workspace://corroboration/c.md', data: { content: 'Business continuity crisis escalation procedure requires management notification.' }, verified: false });
  for (const source of [sourceA, sourceB, sourceC]) ProjectManager.reviewKnowledgeSource(source.id, 'VERIFIED', 'TP 0.20 review', now + 86_400_000);

  const before = KnowledgeHealth.evaluate(ProjectManager.getProject());
  check(before.evidenceStrength === 'MIXED' && before.corroborationGroups === 0, 'Multiple verified sources remain MIXED until user explicitly declares corroboration');
  check(KnowledgeGovernanceWorkflow.createCorroborationGroup('invalid', [sourceA.id]) === null, 'Corroboration group rejects fewer than two active sources');

  const groupId = KnowledgeGovernanceWorkflow.createCorroborationGroup('BCM recovery corroboration', [sourceA.id, sourceC.id]);
  check(Boolean(groupId), 'User can create an explicit corroboration group from two active document sources');
  const corroborated = KnowledgeHealth.evaluate(ProjectManager.getProject());
  check(corroborated.evidenceStrength === 'CORROBORATED' && corroborated.corroboratedSources === 2, 'Explicit group changes evidence strength to CORROBORATED without changing source trust');

  const conflict = corroborated.potentialConflicts.find((item) => item.leftAssetId === sourceA.id || item.rightAssetId === sourceA.id);
  check(Boolean(conflict) && corroborated.openConflicts >= 1, 'Heuristic conflict remains visible even when other sources are grouped as corroborating');
  if (!conflict) throw new Error('Expected numeric conflict missing');
  const pair = [conflict.leftAssetId, conflict.rightAssetId];
  check(!KnowledgeGovernanceWorkflow.reviewConflict(conflict.conflictKey, pair, 'PREFER_SOURCE', 'Invalid preference', sourceC.id), 'Conflict review rejects preferred source outside the conflict pair');
  check(KnowledgeGovernanceWorkflow.reviewConflict(conflict.conflictKey, pair, 'ACCEPTED_VARIANCE', 'Different approved recovery tiers'), 'User can explicitly review a potential conflict as accepted variance');
  const afterReview = KnowledgeHealth.evaluate(ProjectManager.getProject());
  const reviewed = afterReview.potentialConflicts.find((item) => item.conflictKey === conflict.conflictKey);
  check(reviewed?.resolution?.status === 'ACCEPTED_VARIANCE' && afterReview.reviewedConflicts >= 1, 'Reviewed conflict retains source signal and carries explicit human resolution metadata');
  check(afterReview.openConflicts < corroborated.openConflicts, 'Reviewed conflict no longer counts as open-conflict health penalty');

  await ProjectManager.flush();
  const persisted = await storage.get<MioProject>('projects', 'current-project');
  check(persisted?.knowledgeGovernance.corroborationGroups?.some((group) => group.id === groupId) === true, 'Corroboration group survives project storage persistence round-trip');
  check(persisted?.knowledgeGovernance.conflictResolutions?.[conflict.conflictKey]?.status === 'ACCEPTED_VARIANCE', 'Conflict review survives project storage persistence round-trip');
  check(persisted?.knowledgeGovernance.history.some((event) => event.action === 'CORROBORATION_GROUP_CREATED') === true && persisted?.knowledgeGovernance.history.some((event) => event.action === 'CONFLICT_REVIEWED') === true, 'Corroboration and conflict review decisions persist in governance provenance');

  return { passed, total };
}
