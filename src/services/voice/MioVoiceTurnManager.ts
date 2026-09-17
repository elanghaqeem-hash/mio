import type { MioLocale, MioTranscriptionResult } from './MioVoiceProvider';
import { mioVoiceRuntimeV3, type MioVoiceRuntimeV3 } from './MioVoiceRuntimeV3';

export type MioVoiceTurnState = 'IDLE' | 'USER_TURN' | 'THINKING' | 'MIO_TURN' | 'INTERRUPTING';
export type MioVoiceTurnListener = (state: MioVoiceTurnState) => void;

export interface MioVoiceActivityEvent { active: boolean; level?: number; timestamp?: number; }
export interface MioVoiceActivityDetector { readonly id: string; start(onActivity: (event: MioVoiceActivityEvent) => void, signal?: AbortSignal): Promise<void> | void; stop(): Promise<void> | void; }
export interface MioVoiceTurnOptions { preferredProviderId?: string; autoInterruptOnVoiceActivity?: boolean; onVoiceActivityInterrupt?: (event: MioVoiceActivityEvent) => void | Promise<void>; }

/** Coordinates conversational ownership above STT/TTS providers. */
export class MioVoiceTurnManager {
  private state: MioVoiceTurnState = 'IDLE';
  private listeners = new Set<MioVoiceTurnListener>();
  private turnGeneration = 0;
  private vadController: AbortController | null = null;
  private vadInterruptPending = false;

  constructor(private readonly runtime: MioVoiceRuntimeV3 = mioVoiceRuntimeV3) {}
  getState() { return this.state; }
  subscribe(listener: MioVoiceTurnListener): () => void { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); }; }
  private setState(state: MioVoiceTurnState) { if (this.state === state) return; this.state = state; for (const listener of this.listeners) listener(state); }

  async interrupt(): Promise<void> { this.turnGeneration += 1; this.setState('INTERRUPTING'); await this.runtime.interrupt(); this.setState('IDLE'); }

  async beginUserTurn(locale: MioLocale, onResult: (result: MioTranscriptionResult) => void, options: MioVoiceTurnOptions = {}): Promise<void> {
    await this.interrupt(); const generation = ++this.turnGeneration; this.setState('USER_TURN');
    try { await this.runtime.listen(locale, (result) => { if (generation !== this.turnGeneration) return; onResult(result); if (result.final) this.setState('THINKING'); }, options.preferredProviderId); }
    catch (error) { if (generation === this.turnGeneration) this.setState('IDLE'); throw error; }
  }

  markThinking(): void { if (this.state === 'USER_TURN' || this.state === 'IDLE') this.setState('THINKING'); }

  async beginMioTurn(text: string, locale: MioLocale, options: MioVoiceTurnOptions = {}): Promise<void> {
    const generation = ++this.turnGeneration; await this.runtime.interrupt(); if (generation !== this.turnGeneration) return; this.setState('MIO_TURN');
    try { await this.runtime.speak(text, locale, options.preferredProviderId); }
    catch (error) { if (generation === this.turnGeneration) this.setState('IDLE'); throw error; }
    finally { if (generation === this.turnGeneration) this.setState('IDLE'); }
  }

  async attachVoiceActivityDetector(detector: MioVoiceActivityDetector, options: MioVoiceTurnOptions = {}): Promise<() => Promise<void>> {
    await this.detachVoiceActivityDetector(detector); const controller = new AbortController(); this.vadController = controller;
    await detector.start((event) => {
      if (!event.active || controller.signal.aborted || this.vadInterruptPending) return;
      if (options.autoInterruptOnVoiceActivity && this.state === 'MIO_TURN') {
        this.vadInterruptPending = true;
        void (async () => {
          try {
            await this.interrupt();
            if (!controller.signal.aborted) await options.onVoiceActivityInterrupt?.(event);
          } finally { this.vadInterruptPending = false; }
        })();
      }
    }, controller.signal);
    return async () => this.detachVoiceActivityDetector(detector);
  }

  async detachVoiceActivityDetector(detector: MioVoiceActivityDetector): Promise<void> {
    this.vadController?.abort(); this.vadController = null; this.vadInterruptPending = false; await detector.stop();
  }
}

export const mioVoiceTurnManager = new MioVoiceTurnManager();
