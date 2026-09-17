import { CompanionPromptAdapter } from '../intelligence/CompanionPromptAdapter';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export async function runCompanionPromptAdapterTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<() => void> = [
    () => {
      const ctx = CompanionPromptAdapter.prepare('Aku capek banget, dengarkan saja dulu.');
      assert(ctx.assessment.strategy === 'LISTEN_FIRST', 'presence request must choose LISTEN_FIRST');
      assert(CompanionPromptAdapter.coreState(ctx) === 'EMOTIONAL SUPPORT', 'active companion context must expose emotional support state');
      const prompt = CompanionPromptAdapter.augmentSystemPrompt('BASE', ctx);
      assert(prompt.includes('MIO COMPANION POLICY'), 'active companion context must augment system prompt');
      assert(prompt.includes('do not force advice'), 'listen-first guidance must preserve user intent');
    },
    () => {
      const ctx = CompanionPromptAdapter.prepare('Jalankan stress test database staging.');
      assert(ctx.assessment.primaryEmotion === 'NEUTRAL', 'technical stress test must remain emotionally neutral');
      assert(CompanionPromptAdapter.augmentSystemPrompt('BASE', ctx) === 'BASE', 'neutral technical prompts must not alter system prompt');
    },
    () => {
      const ctx = CompanionPromptAdapter.prepare('Aku kesal. Tolong bantu cari jalan keluar.');
      assert(ctx.assessment.strategy === 'ACKNOWLEDGE_AND_SOLVE', 'explicit solution request must switch to solve strategy');
      assert(ctx.allowDurableEmotionalMemory === false, 'transient emotion must never become durable memory automatically');
    },
  ];

  let passed = 0;
  for (const test of tests) { test(); passed += 1; }
  return { passed, total: tests.length };
}
