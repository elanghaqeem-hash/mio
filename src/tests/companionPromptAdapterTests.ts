import { CompanionPromptAdapter } from '../intelligence/CompanionPromptAdapter';
import { CompanionRuntimePolicy } from '../intelligence/CompanionRuntimePolicy';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export async function runCompanionPromptAdapterTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<() => void> = [
    () => {
      const ctx = CompanionPromptAdapter.prepare('Aku capek banget, dengarkan saja dulu.');
      assert(ctx.assessment.strategy === 'LISTEN_FIRST', 'presence request must choose LISTEN_FIRST');
      assert(ctx.emotionalContext === 'Mendengarkan', 'listen-first UI context must stay natural and non-clinical');
      assert(CompanionPromptAdapter.coreState(ctx) === 'EMOTIONAL SUPPORT', 'active companion context must expose emotional support state');
      const prompt = CompanionPromptAdapter.augmentSystemPrompt('BASE', ctx);
      assert(prompt.includes('MIO COMPANION POLICY'), 'active companion context must augment system prompt');
      assert(prompt.includes('do not force advice'), 'listen-first guidance must preserve user intent');
    },
    () => {
      const ctx = CompanionPromptAdapter.prepare('Jalankan stress test database staging.');
      assert(ctx.assessment.primaryEmotion === 'NEUTRAL', 'technical stress test must remain emotionally neutral');
      assert(ctx.emotionalContext === undefined, 'neutral technical prompt must not expose companion UI state');
      assert(CompanionPromptAdapter.augmentSystemPrompt('BASE', ctx) === 'BASE', 'neutral technical prompts must not alter system prompt');
    },
    () => {
      const ctx = CompanionPromptAdapter.prepare('Jalankan stress test ICAAP dan analisis skenario likuiditas.');
      assert(ctx.assessment.primaryEmotion === 'NEUTRAL', 'financial stress testing must remain technical');
      assert(CompanionPromptAdapter.coreState(ctx) === 'THINKING', 'technical stress testing must remain in thinking state');
    },
    () => {
      const ctx = CompanionPromptAdapter.prepare('Aku kesal. Tolong bantu cari jalan keluar.');
      assert(ctx.assessment.strategy === 'ACKNOWLEDGE_AND_SOLVE', 'explicit solution request must switch to solve strategy');
      assert(ctx.emotionalContext === 'Mendengarkan lalu membantu mencari solusi', 'solution UI context must describe behavior, not diagnose emotion');
      assert(ctx.allowDurableEmotionalMemory === false, 'transient emotion must never become durable memory automatically');
    },
    () => {
      const ctx = CompanionPromptAdapter.prepare('Aku senang banget, akhirnya berhasil!');
      assert(ctx.emotionalContext === 'Merayakan bersama', 'celebration must use a natural companion label');
      assert(ctx.voiceProsody.rateMultiplier >= 0.94 && ctx.voiceProsody.rateMultiplier <= 1.03, 'companion rate multiplier must stay bounded');
      assert(ctx.voiceProsody.pitchDelta >= -0.02 && ctx.voiceProsody.pitchDelta <= 0.025, 'companion pitch delta must stay bounded');
      assert(ctx.voiceProsody.volumeMultiplier >= 0.96 && ctx.voiceProsody.volumeMultiplier <= 1, 'companion volume multiplier must stay bounded');
    },
    () => {
      assert(CompanionRuntimePolicy.shouldPersistAsRelationshipPreference('Mulai sekarang saya lebih suka kamu dengarkan dulu sebelum memberi solusi.'), 'explicit stable interaction preference may become a governed memory candidate');
      assert(!CompanionRuntimePolicy.shouldPersistAsRelationshipPreference('Aku capek hari ini.'), 'transient emotional episode must not become a relationship preference');
    },
  ];

  let passed = 0;
  for (const test of tests) { test(); passed += 1; }
  return { passed, total: tests.length };
}
