import { mioVoice } from '../MioVoiceService';
import type { MioTranscriptionResult } from './MioVoiceProvider';
import { mioVoiceProviders } from './MioVoiceProviderRegistry';
import { mioVoiceTurnManager, type MioVoiceTurnManager, type MioVoiceTurnState } from './MioVoiceTurnManager';
import { webAudioVoiceActivityDetector } from './WebAudioVoiceActivityDetector';

export type MioChatVoiceListener = (state: MioVoiceTurnState) => void;

/** Application-facing, provider-neutral voice bridge for Chat Studio. */
export class MioChatVoiceController {
  private detachVad: (() => Promise<void>) | null = null;
  private vadStarting: Promise<void> | null = null;
  private lastResultHandler: ((result: MioTranscriptionResult) => void) | null = null;
  private lastPreferredProviderId: string | undefined;

  constructor(private readonly turns: MioVoiceTurnManager = mioVoiceTurnManager) {}
  subscribe(listener: MioChatVoiceListener): () => void { return this.turns.subscribe(listener); }
  getState(): MioVoiceTurnState { return this.turns.getState(); }
  getLocale(text = ''): string { return text ? mioVoice.resolveLocale(text) : mioVoice.getRecognitionLocale(); }
  setPreferredLocale(locale: string): void { mioVoice.setPreferredLocale(locale); }
  async capabilities() { return mioVoiceProviders.statuses(); }

  async enableAutomaticBargeIn(): Promise<void> {
    if (this.detachVad) return;
    if (this.vadStarting) return this.vadStarting;
    this.vadStarting = (async () => {
      const detach = await this.turns.attachVoiceActivityDetector(webAudioVoiceActivityDetector, {
        autoInterruptOnVoiceActivity: true,
        onVoiceActivityInterrupt: async () => {
          const handler = this.lastResultHandler;
          if (!handler) return;
          // Release WebAudio capture before STT takes ownership of the microphone.
          await this.disableAutomaticBargeIn();
          await this.startListening(handler, this.lastPreferredProviderId);
        },
      });
      this.detachVad = detach;
    })();
    try { await this.vadStarting; } finally { this.vadStarting = null; }
  }

  async disableAutomaticBargeIn(): Promise<void> { const detach = this.detachVad; this.detachVad = null; if (detach) await detach(); }

  async startListening(onResult: (result: MioTranscriptionResult) => void, preferredProviderId?: string): Promise<void> {
    this.lastResultHandler = onResult; this.lastPreferredProviderId = preferredProviderId;
    const locale = this.getLocale();
    await this.turns.beginUserTurn(locale, (result) => { if (result.text) mioVoice.resolveLocale(result.text); onResult(result); }, { preferredProviderId });
  }

  async stop(): Promise<void> { await this.turns.interrupt(); }
  markThinking(): void { this.turns.markThinking(); }

  async speak(text: string, preferredProviderId?: string): Promise<void> {
    const locale = this.getLocale(text);
    await this.turns.beginMioTurn(text, locale, { preferredProviderId, autoInterruptOnVoiceActivity: Boolean(this.detachVad) });
  }

  async toggleListening(onResult: (result: MioTranscriptionResult) => void, preferredProviderId?: string): Promise<void> {
    if (this.getState() === 'USER_TURN') { await this.stop(); return; }
    await this.disableAutomaticBargeIn();
    await this.startListening(onResult, preferredProviderId);
    try { await this.enableAutomaticBargeIn(); } catch (error) { console.warn('[Mio Voice] Automatic barge-in unavailable:', error); }
  }

  async dispose(): Promise<void> {
    this.lastResultHandler = null; this.lastPreferredProviderId = undefined;
    await this.disableAutomaticBargeIn(); await this.stop();
  }
}

export const mioChatVoice = new MioChatVoiceController();
