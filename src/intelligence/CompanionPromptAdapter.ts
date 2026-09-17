import type { ModelMessage } from '../types/models';
import { CompanionContinuity, type CompanionContinuityContext } from './CompanionContinuity';
import { CompanionRuntimeContext, CompanionRuntimePolicy } from './CompanionRuntimePolicy';

export interface CompanionPreparedContext extends CompanionRuntimeContext {
  continuity: CompanionContinuityContext;
}

/**
 * Thin integration boundary between AgentOrchestrator and the companion engine.
 * Emotional inference remains advisory, ephemeral, and separate from durable memory.
 */
export class CompanionPromptAdapter {
  public static prepare(text: string): CompanionRuntimeContext {
    return CompanionRuntimePolicy.prepare(text);
  }

  public static prepareWithHistory(text: string, history: ModelMessage[]): CompanionPreparedContext {
    return {
      ...CompanionRuntimePolicy.prepare(text),
      continuity: CompanionContinuity.fromRecentConversation(text, history),
    };
  }

  public static augmentSystemPrompt(basePrompt: string, context: CompanionRuntimeContext, continuity?: CompanionContinuityContext): string {
    const guidance = [context.systemGuidance, continuity?.continuationHint].filter(Boolean).join(' ');
    if (!guidance) return basePrompt;
    return `${basePrompt} ${guidance}`;
  }

  public static coreState(context: CompanionRuntimeContext): 'THINKING' | 'EMOTIONAL SUPPORT' {
    return context.emotionalContext ? 'EMOTIONAL SUPPORT' : 'THINKING';
  }
}
