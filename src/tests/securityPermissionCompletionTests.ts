import { eventBus } from '../core/EventBus';
import { GovernedMemoryActions } from '../security/GovernedMemoryActions';
import { MioMemoryManager } from '../security/MemoryManager';
import { PermissionEngine } from '../security/PermissionEngine';
import { PERMISSION_LEVEL_POLICIES } from '../security/PermissionPolicy';
import { SecurityAuditLog } from '../security/SecurityAuditLog';
import { ProjectManager } from '../project/ProjectManager';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { DryRunRequest, SecurityEvent } from '../types/security';

interface SuiteResult { passed: number; total: number; }

export async function runSecurityPermissionCompletionTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`SecurityPermissionCompletion test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  check(PERMISSION_LEVEL_POLICIES.map((policy) => policy.level).join(',') === 'L0_OBSERVE,L1_SUGGEST,L2_CREATE,L3_MODIFY,L4_EXECUTE,L5_DESTRUCTIVE', 'Permission policy explicitly defines all L0-L5 levels in order');
  const l4 = PERMISSION_LEVEL_POLICIES.find((policy) => policy.level === 'L4_EXECUTE');
  const l5 = PERMISSION_LEVEL_POLICIES.find((policy) => policy.level === 'L5_DESTRUCTIVE');
  check(l4?.approvalMode === 'USER_DRY_RUN' && l5?.approvalMode === 'USER_DESTRUCTIVE_CONFIRMATION' && l5.maxDefaultUses === 1 && l5.maxTtlMs === 30_000, 'Permission policy distinguishes controlled L4 execution from explicit single-use L5 destructive authority');

  const auditStorage = new InMemoryStorageProvider();
  const audit = new SecurityAuditLog();
  audit.setStorageProvider(auditStorage);
  await audit.initialize();
  const auditEvent: SecurityEvent = { id: 'sec_tp029_persist', timestamp: 1000, level: 'warning', category: 'PERMISSION', action: 'TEST_REAL_EVENT', details: 'Persist this real event', blocked: false };
  eventBus.emit('SECURITY_EVENT', auditEvent);
  await audit.flush();
  const persistedAudit = await auditStorage.get<SecurityEvent[]>('runtime', 'security-audit-v1');
  check(persistedAudit?.some((event) => event.id === auditEvent.id) === true, 'Security audit log persists actual SECURITY_EVENT records through StorageProvider');
  check(audit.getEvents().every((event) => !event.id.startsWith('sec_init_')), 'Security audit log does not fabricate synthetic boot events');

  const projectStorage = new InMemoryStorageProvider();
  ProjectManager.setStorageProvider(projectStorage);
  await ProjectManager.initialize();
  ProjectManager.createProject('TP 0.29 Security Test');
  const memoryStorage = new InMemoryStorageProvider();
  MioMemoryManager.setStorageProvider(memoryStorage);
  await MioMemoryManager.initialize();
  MioMemoryManager.clearAll();
  PermissionEngine.clearForTests();

  const first = MioMemoryManager.addMemory({ category: 'USER_PREF', content: 'Security test memory one', confidence: 1, source: 'user_explicit', permissionLevel: 'L2_CREATE' });
  check(Boolean(first), 'Trusted user memory fixture can be created before governed deletion');
  const deleted = first ? await GovernedMemoryActions.deleteMemory(first) : false;
  check(deleted && MioMemoryManager.getMemories().length === 0, 'Single-memory deletion executes through bounded L3 permission and removes only the selected memory');
  check(PermissionEngine.getActiveGrants().length === 0, 'Single-use L3 memory deletion leaves no reusable authorization grant');

  MioMemoryManager.addMemory({ category: 'USER_PREF', content: 'Security test memory cancel', confidence: 1, source: 'user_explicit', permissionLevel: 'L2_CREATE' });
  let cancelledDryRun: DryRunRequest | undefined;
  const cancelListener = eventBus.on<DryRunRequest>('REQUEST_DRY_RUN_PERMISSION', (request) => { cancelledDryRun = request; request.onCancel(); });
  const cancelled = await GovernedMemoryActions.clearAll();
  cancelListener();
  check(cancelled === false && cancelledDryRun?.permissionLevel === 'L5_DESTRUCTIVE' && MioMemoryManager.getMemories().length === 1, 'Cancelled L5 destructive request cannot clear long-term memory');

  PermissionEngine.clearForTests();
  let approvedDryRun: DryRunRequest | undefined;
  const approveListener = eventBus.on<DryRunRequest>('REQUEST_DRY_RUN_PERMISSION', (request) => { approvedDryRun = request; request.onApprove(); });
  const cleared = await GovernedMemoryActions.clearAll();
  approveListener();
  check(cleared && approvedDryRun?.permissionLevel === 'L5_DESTRUCTIVE' && approvedDryRun.maxUses === 1 && (approvedDryRun.expiresInMs ?? 0) <= 30_000, 'Approved bulk memory deletion is explicitly L5, single-use, and short-lived');
  check(MioMemoryManager.getMemories().length === 0 && PermissionEngine.getActiveGrants().length === 0, 'Consumed L5 destructive grant clears memory and cannot remain as reusable authority');

  PermissionEngine.clearForTests();
  return { passed, total };
}
