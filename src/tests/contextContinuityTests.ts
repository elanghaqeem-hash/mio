import { AgentOrchestrator } from '../agents/AgentOrchestrator';
import { ModelRouter } from '../agents/ModelRouter';
import { ModelMessage } from '../types/models';

export async function runContextContinuityTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ [PASS] ${name}`);
    } else {
      console.error(`✗ [FAIL] ${name}`);
    }
  };

  ModelRouter.configure({ provider: 'local_heuristic', allowOfflineFallback: true, enableWebSearch: false });
  ModelRouter.setNetworkState('OFFLINE');

  const history: ModelMessage[] = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    content: `context-message-${index + 1}`,
  }));

  const response = await AgentOrchestrator.processPrompt('continue this discussion', history);
  assert(response.validationStatus === 'MODEL_RESPONSE_VALIDATED', 'Chat context path produces a validated model response');
  assert(response.executionSummary.includes('12 prior context message(s)'), 'AgentOrchestrator bounds model conversation context to the latest 12 messages');
  assert(response.modelSource === 'LOCAL', 'Context continuity test remains local and does not trigger remote inference');

  return { passed, total };
}
