import { CompanionRuntimeContext, CompanionRuntimePolicy } from './CompanionRuntimePolicy';

/**
 * Thin integration boundary between AgentOrchestrator and the companion engine.
 * Keeps emotional inference advisory and makes it easy to disable without changing
 * the model, memory, or task runtime contracts.
 */
export class CompanionPromptAdapter {
  public static prepare(text: string): CompanionRuntimeContext {
    return CompanionRuntimePolicy.prepare(text);
  }

  public static augmentSystemPrompt(basePrompt: string, context: CompanionRuntimeContext): string {
    if (!context.systemGuidance) return basePrompt;
    return `${basePrompt} ${context.systemGuidance}`;
  }

  public static coreState(context: CompanionRuntimeContext): 'THINKING' | 'EMOTIONAL SUPPORT' {
    return context.emotionalContext ? 'EMOTIONAL SUPPORT' : 'THINKING';
  }
}
