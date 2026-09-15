import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { ProjectManager } from '../project/ProjectManager';
import { KnowledgeReviewInbox } from '../project/KnowledgeReviewInbox';
import type { MioProject } from '../types/project';

interface SuiteResult { passed: number; total: number; }

export async function runKnowledgeReviewInboxTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`KnowledgeReviewInbox test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const storage = new InMemoryStorageProvider();
  ProjectManager.setStorageProvider(storage);
  await ProjectManager.initialize();
  ProjectManager.createProject('TP 0.25 Review Inbox Test');

  const suspicious = ProjectManager.addAsset({
    name: 'Suspicious Research.md', type: 'document', origin: 'IMPORTED', filePath: 'research://suspicious', verified: false,
    data: { content: 'BCM recovery objective is 4 hours.', security: { suspicious: true, detectedThreats: ['prompt injection'] }, revalidationAdvisory: { status: 'REVALIDATE_NOW' }, revalidationHistory: [{ decision: 'KEEP_EXISTING', at: Date.now(), contentChanged: true, similarity: 0.6, metadataChanges: ['publishedAt'], suspicious: true, sourceUrl: 'https://example.test/a' }] },
  });
  const conflicting = ProjectManager.addAsset({
    name: 'Conflicting Research.md', type: 'document', origin: 'IMPORTED', filePath: 'research://conflict', verified: false,
    data: { content: 'BCM recovery objective is 8 hours.', security: { externalUntrustedData: true } },
  });
  const clean = ProjectManager.addAsset({
    name: 'Reviewed Source.md', type: 'document', origin: 'USER-EDITED', filePath: 'project://reviewed', verified: true,
    data: { content: 'Independent governance methodology baseline.' },
  });
  ProjectManager.reviewKnowledgeSource(clean.id, 'VERIFIED', 'Reviewed and current', Date.now() + 30 * 24 * 60 * 60 * 1000);

  const inbox = KnowledgeReviewInbox.build(ProjectManager.getProject());
  const suspiciousItem = inbox.find((item) => item.assetId === suspicious.id);
  check(Boolean(suspiciousItem), 'Derived inbox includes active source with review debt');
  check(suspiciousItem?.severity === 'CRITICAL', 'Suspicious/open-conflict review debt is prioritized CRITICAL');
  check(suspiciousItem?.reasons.includes('SUSPICIOUS_CONTENT') === true, 'Inbox exposes suspicious-content reason explicitly');
  check(suspiciousItem?.reasons.includes('REVALIDATION_DUE') === true, 'Inbox exposes revalidation-due reason explicitly');
  check(inbox.some((item) => item.assetId === conflicting.id), 'Conflicting quarantined source appears in review inbox');
  check(!inbox.some((item) => item.assetId === clean.id), 'Verified current source with no derived review debt is excluded from inbox');

  const timeline = KnowledgeReviewInbox.timeline(ProjectManager.getProject());
  check(timeline.some((event) => event.kind === 'GOVERNANCE' && event.assetId === suspicious.id), 'Unified timeline includes governance provenance events');
  check(timeline.some((event) => event.kind === 'REVALIDATION' && event.assetId === suspicious.id && event.action === 'KEEP_EXISTING'), 'Unified timeline includes asset-level revalidation decisions');
  check(timeline.every((event, index) => index === 0 || timeline[index - 1].timestamp >= event.timestamp), 'Unified timeline is deterministically newest-first');

  const filtered = KnowledgeReviewInbox.timeline(ProjectManager.getProject(), suspicious.id);
  check(filtered.length > 0 && filtered.every((event) => event.assetId === suspicious.id), 'Timeline can be filtered to one governed source without cross-source leakage');

  ProjectManager.setKnowledgeSourceIncluded(conflicting.id, false);
  const afterExclusion = KnowledgeReviewInbox.build(ProjectManager.getProject());
  check(!afterExclusion.some((item) => item.assetId === conflicting.id), 'Excluded source is removed from active review inbox');

  await ProjectManager.flush();
  const persisted = await storage.get<MioProject>('projects', 'current-project');
  check(Boolean(persisted?.assets.find((asset) => asset.id === suspicious.id)?.data?.revalidationHistory), 'Underlying revalidation provenance remains persistent after inbox derivation');
  check(KnowledgeReviewInbox.timeline(persisted!).some((event) => event.kind === 'REVALIDATION'), 'Unified timeline can be reconstructed after project persistence round-trip');

  return { passed, total };
}
