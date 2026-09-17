import { EmotionalAssessment, EmotionalIntelligenceEngine } from './EmotionalIntelligenceEngine';

export interface CompanionVoiceProsody { rateMultiplier: number; pitchDelta: number; volumeMultiplier: number; }
export interface CompanionRuntimeContext { assessment: EmotionalAssessment; emotionalContext?: string; systemGuidance: string; voiceProsody: CompanionVoiceProsody; allowDurableEmotionalMemory: false; }

export class CompanionRuntimePolicy {
  public static prepare(text: string): CompanionRuntimeContext {
    const assessment = EmotionalIntelligenceEngine.analyze(text);
    const active = assessment.primaryEmotion !== 'NEUTRAL' || assessment.intent !== 'GENERAL';
    return {
      assessment,
      emotionalContext: active ? `${assessment.strategy}: ${assessment.primaryEmotion} (${assessment.intensity})` : undefined,
      systemGuidance: EmotionalIntelligenceEngine.systemGuidance(assessment),
      voiceProsody: this.voiceProsody(assessment),
      // Emotional episodes are ephemeral. Stable communication preferences must go through
      // the existing governed MemoryPolicy/review flow rather than being inferred here.
      allowDurableEmotionalMemory: false,
    };
  }

  public static voiceProsody(a: EmotionalAssessment): CompanionVoiceProsody {
    switch (a.strategy) {
      case 'LISTEN_FIRST':
      case 'ACKNOWLEDGE_AND_LISTEN': return { rateMultiplier: 0.94, pitchDelta: -0.02, volumeMultiplier: 0.96 };
      case 'CELEBRATE_WITH_USER': return { rateMultiplier: 1.03, pitchDelta: 0.025, volumeMultiplier: 1 };
      case 'GENTLE_PERSPECTIVE': return { rateMultiplier: 0.98, pitchDelta: -0.01, volumeMultiplier: 0.98 };
      case 'ACKNOWLEDGE_AND_SOLVE': return { rateMultiplier: 0.98, pitchDelta: -0.015, volumeMultiplier: 0.98 };
      default: return { rateMultiplier: 1, pitchDelta: 0, volumeMultiplier: 1 };
    }
  }

  public static shouldPersistAsRelationshipPreference(text: string): boolean {
    // Only explicit, stable user preferences qualify as candidates. This does not write memory.
    return /(?:ingat|remember|mulai sekarang|from now on|aku lebih suka|saya lebih suka|i prefer).*(?:dengarkan|listen|solusi|advice|langsung|direct|singkat|concise|detail)/i.test(text);
  }
}
