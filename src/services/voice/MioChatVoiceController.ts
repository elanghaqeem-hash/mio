import { mioVoice } from '../MioVoiceService';
import type { MioTranscriptionResult } from './MioVoiceProvider';
import { mioVoiceProviders } from './MioVoiceProviderRegistry';
import { mioVoiceTurnManager, type MioVoiceTurnManager, type MioVoiceTurnState } from './MioVoiceTurnManager';

export type MioChatVoiceListener = (state: MioVoiceTurnState) => void;

/**
 * Application-facing bridge for Chat Studio.
 *
 * Chat UI should use this controller rather than constructing browser
 * SpeechRecognition or speechSynthesis objects. That keeps the UI independent
 * from DEVICE vs STREAMING providers while preserving Mio's language profile.
 */
export class MioChatVoiceController {
  constructor(private readonly turns: MioVoiceTurnManager = mioVoiceTurnManager) {}

  subscribe(listener: MioChatVoiceListener): () => void {
    return this.turns.subscribe(listener);
  }

  getState(): MioVoiceTurnState {
    return this.turns.getState();
  }

  getLocale(text = ''): string {
    return text ? mioVoice.resolveLocale(text) : mioVoice.getRecognitionLocale();
  }

  setPreferredLocale(locale: string): void {
    mioVoice.setPreferredLocale(locale);
  }

  async capabilities() {
    return mioVoiceProviders.statuses();
  }

  async startListening(
    onResult: (result: MioTranscriptionResult) => void,
    preferredProviderId?: string,
  ): Promise<void> {
    const locale = this.getLocale();
    await this.turns.beginUserTurn(locale, (result) => {
      if (result.text) mioVoice.resolveLocale(result.text);
      onResult(result);
    }, { preferredProviderId });
  }

  async stop(): Promise<void> {
    await this.turns.interrupt();
  }

  markThinking(): void {
    this.turns.markThinking();
  }

  async speak(text: string, preferredProviderId?: string): Promise<void> {
    const locale = this.getLocale(text);
    await this.turns.beginMioTurn(text, locale, { preferredProviderId });
  }

  async toggleListening(
    onResult: (result: MioTranscriptionResult) => void,
    preferredProviderId?: string,
  ): Promise<void> {
    if (this.getState() === 'USER_TURN') {
      await this.stop();
      return;
    }
    await this.startListening(onResult, preferredProviderId);
  }
}

export const mioChatVoice = new MioChatVoiceController();
