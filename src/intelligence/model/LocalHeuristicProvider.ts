import { ModelProvider, ModelRequest, ModelResponse } from '../../types/models';

export class LocalHeuristicProvider implements ModelProvider {
  public readonly id = 'local_heuristic' as const;
  public readonly displayName = 'MIO Local Heuristic';
  public readonly requiresNetwork = false;
  public readonly requiresProxy = false;

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const lastUser = [...request.messages].reverse().find((message) => message.role === 'user')?.content.trim() ?? '';
    const text = lastUser
      ? `MIO is operating in offline heuristic mode. I can classify, plan, route, validate, and work with local MIO capabilities, but no cloud language model is active for open-ended generation. Your request was: “${lastUser}”.`
      : 'MIO is operating in offline heuristic mode. No user content was supplied.';

    return {
      provider: this.id,
      model: 'mio-local-heuristic-v1',
      text,
      generatedAt: Date.now(),
      source: 'LOCAL',
      finishReason: 'completed',
    };
  }
}
