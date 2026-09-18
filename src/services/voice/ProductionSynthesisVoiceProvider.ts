import { MioVoicePlaybackError, mioStreamingAudioPlayer, type MioStreamingAudioPlayer } from './MioStreamingAudioPlayer';
import { mioSynthesisOrchestrator, type MioSynthesisOrchestrator, type MioSynthesisSession } from './MioSynthesisOrchestrator';
import type { MioSpeechRequest, MioVoiceProvider, MioVoiceProviderStatus } from './MioVoiceProvider';

export type MioProductionVoiceFailureStage = 'PRE_AUDIO' | 'MID_STREAM';

export class MioProductionVoiceError extends Error {
  constructor(message: string, readonly stage: MioProductionVoiceFailureStage, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MioProductionVoiceError';
  }
}

/** TTS-only Voice Runtime V3 adapter backed by the Mio V4 production synthesis kernel. */
export class ProductionSynthesisVoiceProvider implements MioVoiceProvider {
  readonly id = 'mio-production-synthesis';
  readonly kind = 'STREAMING' as const;
  private activeController: AbortController | null = null;
  private generation = 0;

  constructor(
    private readonly synthesis: MioSynthesisOrchestrator = mioSynthesisOrchestrator,
    private readonly player: MioStreamingAudioPlayer = mioStreamingAudioPlayer,
  ) {}

  async status(): Promise<MioVoiceProviderStatus> {
    const ready = await this.synthesis.status() === 'READY';
    return {
      id: this.id,
      kind: this.kind,
      available: ready,
      capabilities: ready ? ['TTS', 'STREAMING_TTS', 'INTERRUPT'] : [],
      reason: ready ? undefined : 'No licensed Mio production synthesis provider is configured.',
    };
  }

  async speak(request: MioSpeechRequest): Promise<void> {
    await this.stopSpeaking();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.activeController = controller;
    const relayAbort = () => controller.abort();
    request.signal?.addEventListener('abort', relayAbort, { once: true });
    let session: MioSynthesisSession | null = null;
    try {
      try {
        session = await this.synthesis.start(request.text, request.locale);
      } catch (error) {
        throw new MioProductionVoiceError('Mio production synthesis could not start.', 'PRE_AUDIO', { cause: error });
      }
      if (!session) throw new MioProductionVoiceError('Mio production synthesis is unavailable.', 'PRE_AUDIO');
      if (generation !== this.generation || controller.signal.aborted) {
        await session.cancel();
        return;
      }
      try {
        await this.player.play(session.chunks, controller.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        if (error instanceof MioVoicePlaybackError) {
          throw new MioProductionVoiceError(error.message, error.stage, { cause: error });
        }
        throw new MioProductionVoiceError('Mio production audio failed before playback.', 'PRE_AUDIO', { cause: error });
      }
    } finally {
      request.signal?.removeEventListener('abort', relayAbort);
      if (session) await session.cancel().catch(() => undefined);
      if (this.activeController === controller) this.activeController = null;
    }
  }

  async stopSpeaking(): Promise<void> {
    this.generation += 1;
    this.activeController?.abort();
    this.activeController = null;
    this.player.stop();
    await this.synthesis.stop();
  }
}

export const productionSynthesisVoiceProvider = new ProductionSynthesisVoiceProvider();
