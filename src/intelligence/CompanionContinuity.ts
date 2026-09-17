import type { ModelMessage } from '../types/models';
import { EmotionalIntelligenceEngine, type EmotionalAssessment } from './EmotionalIntelligenceEngine';

export interface CompanionContinuityContext {
  previousAssessment?: EmotionalAssessment;
  continuationHint?: string;
  sourceTurns: number;
  durable: false;
}

const EXPLICIT_RESET = /(?:sudah (?:nggak|gak|tidak)|udah (?:nggak|gak|tidak)|sekarang (?:aku|saya) (?:baik|oke|ok|tenang)|i(?:'m| am) (?:fine|okay|ok|calm) now|never mind|lupakan itu)/i;
const CONTINUATION = /(?:masih|tetap|belum|still|same|itu juga|begitu juga|lanjut|continue|iya|ya|yeah|yep|hmm|hm)/i;

/**
 * Builds short-lived conversational continuity from recent user turns only.
 * It never writes memory and never turns an earlier emotional inference into a
 * durable identity trait. The current turn always has priority.
 */
export class CompanionContinuity {
  public static fromRecentConversation(currentText: string, history: ModelMessage[]): CompanionContinuityContext {
    if (EXPLICIT_RESET.test(currentText)) return { sourceTurns: 0, durable: false };

    const current = EmotionalIntelligenceEngine.analyze(currentText);
    if (current.primaryEmotion !== 'NEUTRAL' || current.intent !== 'GENERAL') return { sourceTurns: 0, durable: false };
    if (!CONTINUATION.test(currentText.trim())) return { sourceTurns: 0, durable: false };

    const recentUserTurns = history.filter((message) => message.role === 'user').slice(-3).reverse();
    for (let index = 0; index < recentUserTurns.length; index += 1) {
      const assessment = EmotionalIntelligenceEngine.analyze(recentUserTurns[index].content);
      if (assessment.primaryEmotion === 'NEUTRAL' && assessment.intent === 'GENERAL') continue;
      return {
        previousAssessment: assessment,
        continuationHint: `EPHEMERAL COMPANION CONTINUITY: The user's current short reply may continue the immediately preceding conversational context (${assessment.intent}/${assessment.primaryEmotion}). Treat this only as a tentative short-lived hint. Do not diagnose, intensify, or store it. The current message, explicit correction, and current request always override this hint.`,
        sourceTurns: index + 1,
        durable: false,
      };
    }
    return { sourceTurns: 0, durable: false };
  }
}
