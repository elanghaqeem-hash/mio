import { ProjectManager } from '../project/ProjectManager';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { MioProject } from '../types/project';

export async function runKnowledgeGovernanceWorkflowTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total += 1;
    if (!condition) throw new Error(`Knowledge governance workflow test failed: ${name}`);
    passed += 1;
    console.log(`✓ [PASS] ${name}`);
  };

  const storage = new InMemoryStorageProvider();
  ProjectManager.setStorageProvider(storage);
  ProjectManager.createProject('TP 0.18 Governance Workflow', 'Review queue and supersession validation');

  const oldSource = ProjectManager.addAsset({
    name: 'Policy-v1.md', type: 'document', origin: 'IMPORTED', filePath: 'workspace://ws_test/policy-v1.md',
    data: { content: 'Policy version one requires annual review.', quarantine: true }, verified: false,
  });
  const replacement = ProjectManager.addAsset({
    name: 'Policy-v2.md', type: 'document', origin: 'IMPORTED', filePath: 'workspace://ws_test/policy-v2.md',
    data: { content: 'Policy version two requires quarterly review.', quarantine: true }, verified: false,
  });

  assert(ProjectManager.getKnowledgeGovernance(oldSource.id)?.trust === 'QUARANTINED', 'New imported document enters governance as QUARANTINED');
  ProjectManager.reviewKnowledgeSource(replacement.id, 'VERIFIED', 'Reviewed replacement source', Date.now() + 30 * 24 * 60 * 60 * 1000);
  const reviewed = ProjectManager.getKnowledgeGovernance(replacement.id);
  assert(reviewed?.trust === 'VERIFIED' && Boolean(reviewed.freshUntil && reviewed.freshUntil > Date.now()), 'Review workflow promotes replacement to VERIFIED with current freshness horizon');

  assert(ProjectManager.supersedeKnowledgeSource(oldSource.id, replacement.id), 'Supersession workflow accepts a distinct replacement document');
  const oldGovernance = ProjectManager.getKnowledgeGovernance(oldSource.id);
  assert(oldGovernance?.included === false && oldGovernance.supersededByAssetId === replacement.id, 'Superseded source is excluded and linked to its replacement');
  assert(!ProjectManager.supersedeKnowledgeSource(replacement.id, replacement.id), 'Supersession workflow rejects self-replacement');

  await ProjectManager.flush();
  const persisted = await storage.get<MioProject>('projects', 'current-project');
  const supersessionEvent = persisted?.knowledgeGovernance.history.find((event) => event.assetId === oldSource.id && event.action === 'SUPERSEDED');
  assert(supersessionEvent?.replacementAssetId === replacement.id, 'Supersession provenance persists replacement source identity');
  assert(persisted?.knowledgeGovernance.history.some((event) => event.assetId === replacement.id && event.action === 'REVIEWED') === true, 'Replacement review event persists in provenance timeline');

  return { passed, total };
}
