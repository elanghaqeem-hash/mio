import { mioStreamingAudioPlayer, type MioStreamingAudioPlayer } from './MioStreamingAudioPlayer';
import { mioSynthesisOrchestrator, type MioSynthesisOrchestrator } from './MioSynthesisOrchestrator';
import type { MioSpeechRequest, MioVoiceProvider, MioVoiceProviderStatus } from './MioVoiceProvider';

/** TTS-only Voice Runtime V3 adapter backed by the Mio V4 production synthesis kernel. */
export class ProductionSynthesisVoiceProvider implements MioVoiceProvider {
  readonly id = 'mio-production-synthesis';
  readonly kind = 'STREAMING' as const;
  private activeController: AbortController | null = null;

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
    const controller = new AbortController();
    this.activeController = controller;
    const relayAbort = () => controller.abort();
    request.signal?.addEventListener('abort', relayAbort, { once: true });
    try {
      const session = await this.synthesis.start(request.text, request.locale);
      if (!session) throw new Error('Mio production synthesis is unavailable.');
      await this.player.play(session.chunks, controller.signal);
    } finally {
      request.signal?.removeEventListener('abort', relayAbort);
      if (this.activeController === controller) this.activeController = null;
    }
  }

  async stopSpeaking(): Promise<void> {
    this.activeController?.abort();
    this.activeController = null;
    this.player.stop();
    await this.synthesis.stop();
  }
}

export const productionSynthesisVoiceProvider = new ProductionSynthesisVoiceProvider();
