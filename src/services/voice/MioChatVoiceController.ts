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

  constructor(private readonly turns: MioVoiceTurnManager = mioVoiceTurnManager) {}

  subscribe(listener: MioChatVoiceListener): () => void { return this.turns.subscribe(listener); }
  getState(): MioVoiceTurnState { return this.turns.getState(); }
  getLocale(text = ''): string { return text ? mioVoice.resolveLocale(text) : mioVoice.getRecognitionLocale(); }
  setPreferredLocale(locale: string): void { mioVoice.setPreferredLocale(locale); }
  async capabilities() { return mioVoiceProviders.statuses(); }

  /**
   * Enables local energy-based barge-in. Permission is requested only when this
   * method is called from a user-initiated voice flow; audio is never persisted.
   */
  async enableAutomaticBargeIn(): Promise<void> {
    if (this.detachVad) return;
    if (this.vadStarting) return this.vadStarting;
    this.vadStarting = (async () => {
      const detach = await this.turns.attachVoiceActivityDetector(webAudioVoiceActivityDetector, { autoInterruptOnVoiceActivity: true });
      this.detachVad = detach;
    })();
    try { await this.vadStarting; }
    finally { this.vadStarting = null; }
  }

  async disableAutomaticBargeIn(): Promise<void> {
    const detach = this.detachVad;
    this.detachVad = null;
    if (detach) await detach();
  }

  async startListening(onResult: (result: MioTranscriptionResult) => void, preferredProviderId?: string): Promise<void> {
    const locale = this.getLocale();
    await this.turns.beginUserTurn(locale, (result) => {
      if (result.text) mioVoice.resolveLocale(result.text);
      onResult(result);
    }, { preferredProviderId });
  }

  async stop(): Promise<void> { await this.turns.interrupt(); }
  markThinking(): void { this.turns.markThinking(); }

  async speak(text: string, preferredProviderId?: string): Promise<void> {
    const locale = this.getLocale(text);
    await this.turns.beginMioTurn(text, locale, { preferredProviderId, autoInterruptOnVoiceActivity: Boolean(this.detachVad) });
  }

  async toggleListening(onResult: (result: MioTranscriptionResult) => void, preferredProviderId?: string): Promise<void> {
    if (this.getState() === 'USER_TURN') { await this.stop(); return; }
    await this.startListening(onResult, preferredProviderId);
  }

  async dispose(): Promise<void> {
    await this.disableAutomaticBargeIn();
    await this.stop();
  }
}

export const mioChatVoice = new MioChatVoiceController();
