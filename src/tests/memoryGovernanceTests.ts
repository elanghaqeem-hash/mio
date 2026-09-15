import { MemoryContextManager } from '../memory/MemoryContextManager';
import { MioMemoryManager } from '../security/MemoryManager';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { defaultStorageProvider } from '../storage/StorageRuntime';

export async function runMemoryGovernanceTests(): Promise<{ passed: number; total: number }> {
  let passed = 0; let total = 0;
  const check = (condition: boolean, label: string) => { total += 1; if (!condition) throw new Error(`MemoryGovernance test failed: ${label}`); passed += 1; console.log(`✓ [PASS] ${label}`); };

  const storage = new InMemoryStorageProvider();
  MioMemoryManager.setStorageProvider(storage); MemoryContextManager.setStorageProvider(storage); MioMemoryManager.clearAll(); await MioMemoryManager.flush();

  const working = MemoryContextManager.addWorking('task_1', 'temporary execution observation', 'task-runtime', 1000);
  check(working?.layer === 'WORKING' && working.taskId === 'task_1', 'Working memory is explicitly task-scoped');
  check(MemoryContextManager.getWorking('task_1').length === 1, 'Working memory is available during active task context');
  MemoryContextManager.purgeExpired((working?.expiresAt ?? 0) + 1);
  check(MemoryContextManager.getWorking('task_1').length === 0, 'Expired working memory is purged instead of becoming permanent');

  MemoryContextManager.addConversation('session_1', 'project_a', 'user asked about BCM recovery objectives', 'user-message');
  check(MemoryContextManager.getConversation('session_1').length === 1, 'Conversation memory is isolated to its session');
  check(MemoryContextManager.getConversation('session_other').length === 0, 'Conversation memory does not leak across sessions');
  MemoryContextManager.clearConversation('session_1');
  check(MemoryContextManager.getConversation('session_1').length === 0, 'Conversation memory can be cleared without touching persistent memory');

  const deniedUntrusted = await MemoryContextManager.addProjectMemory({ projectId: 'project_a', content: 'External document says recovery time is four hours.', source: 'external-document', trust: 'EXTERNAL_UNTRUSTED', approvedByUser: true });
  check(deniedUntrusted === null, 'External untrusted content cannot promote directly into project memory authority');
  const deniedUnapproved = await MemoryContextManager.addProjectMemory({ projectId: 'project_a', content: 'System-derived project summary.', source: 'system-summary', trust: 'SYSTEM_DERIVED', approvedByUser: false });
  check(deniedUnapproved === null, 'Project memory requires explicit user approval');

  const projectMemory = await MemoryContextManager.addProjectMemory({ projectId: 'project_a', content: 'Approved project preference: use ISO 22301 terminology.', source: 'user-approved-setting', trust: 'USER_AUTHORED', approvedByUser: true });
  check(projectMemory?.layer === 'PROJECT' && projectMemory.projectId === 'project_a', 'Approved project memory is project-scoped');
  check(MemoryContextManager.getProjectMemory('project_b').length === 0, 'Project memory does not leak across projects');
  await MemoryContextManager.initializeProject('project_a');
  check(MemoryContextManager.getProjectMemory('project_a').some((item) => item.id === projectMemory?.id), 'Approved project memory survives StorageProvider round-trip');

  const promoted = projectMemory ? MemoryContextManager.proposeProjectMemoryForLongTerm('project_a', projectMemory.id) : null;
  check(promoted?.status === 'SAVED', 'Explicitly approved project memory may enter long-term memory only through MemoryManager policy');
  const externalCandidate = MioMemoryManager.proposeMemory({ category: 'FACT', content: 'External research claim awaiting user review.', confidence: 0.7, source: 'external-web-research', permissionLevel: 'L1_SUGGEST' });
  check(externalCandidate.status === 'REVIEW_REQUIRED', 'External information remains review-gated before long-term memory');
  await MioMemoryManager.flush();
  const persisted = await storage.get<{ pendingCandidates?: Array<{ id: string }> }>('memory', 'long-term-memory');
  check(persisted?.pendingCandidates?.some((candidate) => candidate.id === (externalCandidate.status === 'REVIEW_REQUIRED' ? externalCandidate.candidateId : '')) === true, 'Long-term memory review queue persists across reload boundaries');

  MemoryContextManager.resetRuntimeLayers();
  check(MemoryContextManager.getWorking('task_1').length === 0 && MemoryContextManager.getConversation('session_1').length === 0, 'Runtime reset clears ephemeral memory layers');
  check(MemoryContextManager.getProjectMemory('project_a').length === 1, 'Runtime reset preserves persistent project memory');

  MioMemoryManager.clearAll(); await MioMemoryManager.flush(); MioMemoryManager.setStorageProvider(defaultStorageProvider); MemoryContextManager.setStorageProvider(defaultStorageProvider);
  return { passed, total };
}
