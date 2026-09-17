import { CompanionPromptAdapter } from '../intelligence/CompanionPromptAdapter';
import { EmotionalIntelligenceEngine } from '../intelligence/EmotionalIntelligenceEngine';
import { CompanionRuntimePolicy } from '../intelligence/CompanionRuntimePolicy';

export async function runEmotionalIntelligenceEngineTests(): Promise<{ passed: number; total: number }> {
  let passed = 0; let total = 0;
  const assert = (condition: boolean, name: string) => { total++; if (condition) { passed++; console.log(`✓ [PASS] ${name}`); } else console.error(`✗ [FAIL] ${name}`); };
  const listenId = EmotionalIntelligenceEngine.analyze('Mio, aku capek banget. Cuma ingin cerita, dengarkan aja ya.');
  assert(listenId.primaryEmotion === 'EXHAUSTION', 'ID: detects exhaustion');
  assert(listenId.intent === 'SEEKING_PRESENCE' && listenId.strategy === 'LISTEN_FIRST', 'ID: listening request wins over solving');
  assert(!listenId.solutionRequested, 'ID: does not force a solution');
  const solveId = EmotionalIntelligenceEngine.analyze('Aku kesal dengan masalah ini. Tolong bantu cari jalan keluar.');
  assert(solveId.primaryEmotion === 'FRUSTRATION', 'ID: detects frustration');
  assert(solveId.intent === 'SEEKING_SOLUTION' && solveId.strategy === 'ACKNOWLEDGE_AND_SOLVE', 'ID: routes emotional problem solving');
  const listenEn = EmotionalIntelligenceEngine.analyze('I am overwhelmed. I just want you to listen, no advice.');
  assert(listenEn.primaryEmotion === 'STRESS' && listenEn.intent === 'SEEKING_PRESENCE', 'EN: detects overwhelm and listening intent');
  const validationId = EmotionalIntelligenceEngine.analyze('Aku sedih dan kesal. Wajar nggak kalau aku merasa begini?');
  assert(validationId.intent === 'SEEKING_VALIDATION' && validationId.strategy === 'ACKNOWLEDGE_AND_LISTEN', 'ID: validation is distinct from advice seeking');
  assert(!validationId.solutionRequested && validationId.signals.includes('intent:validation'), 'ID: validation does not accidentally force solution mode');
  const validationEn = EmotionalIntelligenceEngine.analyze('I am anxious. Am I overreacting?');
  assert(validationEn.intent === 'SEEKING_VALIDATION', 'EN: detects emotional validation request');
  const perspective = EmotionalIntelligenceEngine.analyze('Menurutmu aku salah? Tolong lihat dari sisi lain.');
  assert(perspective.intent === 'SEEKING_PERSPECTIVE', 'Perspective stays distinct from validation');
  const celebration = EmotionalIntelligenceEngine.analyze('Aku senang banget, akhirnya berhasil!');
  assert(celebration.intent === 'CELEBRATING' && celebration.strategy === 'CELEBRATE_WITH_USER', 'Celebration gets positive strategy');
  const technicalStress = EmotionalIntelligenceEngine.analyze('Jalankan stress test database dan analisis bottleneck.');
  assert(technicalStress.primaryEmotion === 'NEUTRAL' && technicalStress.intent === 'GENERAL', 'Technical stress test is not emotional support');
  const runtime = CompanionRuntimePolicy.prepare('Aku sedih. Dengarkan saja dulu, Mio.');
  assert(runtime.assessment.strategy === 'LISTEN_FIRST' && !!runtime.systemGuidance, 'Runtime prepares companion guidance');
  assert(runtime.allowDurableEmotionalMemory === false, 'Transient emotional state cannot become durable memory');
  assert(runtime.voiceProsody.rateMultiplier >= 0.9 && runtime.voiceProsody.rateMultiplier <= 1.1, 'Voice adaptation remains subtle and bounded');
  assert(CompanionRuntimePolicy.shouldPersistAsRelationshipPreference('Mulai sekarang ingat, saya lebih suka didengarkan dulu sebelum solusi.'), 'Explicit stable preference can enter governed memory review');
  assert(!CompanionRuntimePolicy.shouldPersistAsRelationshipPreference('Hari ini aku sedih banget.'), 'Transient emotion is not a relationship-memory candidate');

  const adapterListen = CompanionPromptAdapter.prepare('Mio, aku lelah. Temani dan dengarkan dulu.');
  const basePrompt = 'You are MIO. Follow safety policy.';
  const augmentedPrompt = CompanionPromptAdapter.augmentSystemPrompt(basePrompt, adapterListen);
  assert(CompanionPromptAdapter.coreState(adapterListen) === 'EMOTIONAL SUPPORT', 'Adapter activates emotional-support core state only for companion context');
  assert(augmentedPrompt.startsWith(basePrompt) && augmentedPrompt.length > basePrompt.length, 'Adapter appends bounded companion guidance without replacing base policy');

  const adapterTechnical = CompanionPromptAdapter.prepare('Jalankan stress test ICAAP dan buat analisis sensitivitas modal.');
  assert(CompanionPromptAdapter.coreState(adapterTechnical) === 'THINKING', 'Adapter keeps technical stress testing in normal thinking state');
  assert(CompanionPromptAdapter.augmentSystemPrompt(basePrompt, adapterTechnical) === basePrompt, 'Neutral technical prompts do not alter the system prompt');

  const guidance = EmotionalIntelligenceEngine.systemGuidance(listenId);
  assert(guidance.includes('never as a diagnosis') && guidance.includes('do not force advice'), 'Guidance avoids diagnosis and unwanted advice');
  assert(guidance.includes('Never encourage emotional dependency') && guidance.includes('Never claim to have human feelings'), 'Guidance protects agency and AI identity');
  const validationGuidance = EmotionalIntelligenceEngine.systemGuidance(validationId);
  assert(validationGuidance.includes('without automatically validating unverified beliefs'), 'Validation guidance separates feelings from unverified beliefs');
  return { passed, total };
}
