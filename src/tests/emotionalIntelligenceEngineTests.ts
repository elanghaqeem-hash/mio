import { EmotionalIntelligenceEngine } from '../intelligence/EmotionalIntelligenceEngine';

export async function runEmotionalIntelligenceEngineTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total++;
    if (condition) { passed++; console.log(`✓ [PASS] ${name}`); }
    else console.error(`✗ [FAIL] ${name}`);
  };

  const listenId = EmotionalIntelligenceEngine.analyze('Mio, aku capek banget. Cuma ingin cerita, dengarkan aja ya.');
  assert(listenId.primaryEmotion === 'EXHAUSTION', 'ID: detects exhaustion');
  assert(listenId.intent === 'SEEKING_PRESENCE' && listenId.strategy === 'LISTEN_FIRST', 'ID: explicit listening request wins over problem solving');
  assert(listenId.solutionRequested === false, 'ID: does not force a solution when user wants presence');

  const solveId = EmotionalIntelligenceEngine.analyze('Aku kesal dengan masalah ini. Tolong bantu cari jalan keluar.');
  assert(solveId.primaryEmotion === 'FRUSTRATION', 'ID: detects frustration');
  assert(solveId.intent === 'SEEKING_SOLUTION' && solveId.strategy === 'ACKNOWLEDGE_AND_SOLVE', 'ID: emotional problem-solving request is routed correctly');

  const listenEn = EmotionalIntelligenceEngine.analyze('I am overwhelmed. I just want you to listen, no advice.');
  assert(listenEn.primaryEmotion === 'STRESS', 'EN: detects overwhelm');

  const perspective = EmotionalIntelligenceEngine.analyze('Menurutmu aku salah? Tolong lihat dari sisi lain.');
  assert(perspective.intent === 'SEEKING_PERSPECTIVE', 'Perspective request remains distinct from emotional validation');

  const celebration = EmotionalIntelligenceEngine.analyze('Aku senang banget, akhirnya berhasil!');
  assert(celebration.intent === 'CELEBRATING' && celebration.strategy === 'CELEBRATE_WITH_USER', 'Celebration gets a positive companion strategy');

  const technicalStress = EmotionalIntelligenceEngine.analyze('Jalankan stress test database dan analisis bottleneck.');
  assert(technicalStress.intent === 'GENERAL', 'Technical stress-test phrase must not become emotional support');

  const neutral = EmotionalIntelligenceEngine.analyze('Tolong jelaskan arsitektur database ini.');
  assert(neutral.primaryEmotion === 'NEUTRAL', 'Neutral technical request remains emotionally neutral');

  const guidance = EmotionalIntelligenceEngine.systemGuidance(listenId);
  assert(guidance.includes('never as a diagnosis') && guidance.includes('do not force advice'), 'Guidance protects against diagnosis and unwanted advice');
  assert(guidance.includes('Never encourage emotional dependency') && guidance.includes('Never claim to have human feelings'), 'Guidance protects user agency and AI identity boundaries');

  return { passed, total };
}
