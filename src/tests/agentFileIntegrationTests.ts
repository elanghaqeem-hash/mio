import { ModelRouter } from '../agents/ModelRouter';
import { planAgentFileAction } from '../agents/FileIntelligenceAgentBridge';
import type { OrganizationManifest } from '../file-intelligence/SmartOrganizer';

const assert = (value: unknown, message: string): void => { if (!value) throw new Error(message); };

// MIO-PRV-00.08 (T-18, ported from #520 with its failing assertion fixed).
export function runAgentFileIntegrationTests(): { passed: number; total: number } {
  const original = ModelRouter.getConfig();
  const originalNetwork = ModelRouter.getNetworkState();
  const tests: Array<[string, () => void]> = [
    ['search requests are validated and never mutate', () => {
      const search = planAgentFileAction({ action: 'SEARCH', query: { text: '  report  ', modes: ['FILENAME'], limit: 10 } });
      assert(search.status === 'READY' && search.mutationExecuted === false, 'valid search not ready');
    }],
    ['organize previews that claim mutation rights are rejected, not thrown', () => {
      const manifest = { id: 'm', generatedBy: 'mio-smart-organizer-v1', mutationAllowed: true, recommendations: [] } as unknown as OrganizationManifest;
      const rejected = planAgentFileAction({ action: 'ORGANIZE_PREVIEW', manifest });
      assert(rejected.status === 'REJECTED' && rejected.mutationExecuted === false, 'mutating manifest accepted');
      const preview = planAgentFileAction({ action: 'ORGANIZE_PREVIEW', manifest: { id: 'm', generatedBy: 'mio-smart-organizer-v1', mutationAllowed: false, recommendations: [] } });
      assert(preview.status === 'READY', 'valid preview rejected');
    }],
    ['AI routing is described by ModelRouter and reports budget blocks', () => {
      ModelRouter.setNetworkState('ONLINE');
      ModelRouter.configure({ provider: 'openai', model: 'gpt-test', monthlyCloudBudgetUsd: 0 });
      const blocked = planAgentFileAction({ action: 'AI_ROUTE' });
      const blockedRoute = blocked.payload as { costClass: string; blockedReason: string | null };
      assert(blocked.status === 'UNAVAILABLE' && blockedRoute.costClass === 'PAID_CLOUD' && blockedRoute.blockedReason?.includes('$0'), 'paid route without budget must be unavailable');
      ModelRouter.configure({ provider: 'local_heuristic' });
      const local = planAgentFileAction({ action: 'AI_ROUTE' });
      assert(local.status === 'READY' && (local.payload as { costClass: string }).costClass === 'LOCAL', 'local route should be ready');
    }],
  ];
  let passed = 0;
  try {
    for (const [name, run] of tests) { run(); passed++; console.log(`✓ [PASS] ${name}`); }
  } finally {
    ModelRouter.configure(original);
    ModelRouter.setNetworkState(originalNetwork);
  }
  return { passed, total: tests.length };
}
