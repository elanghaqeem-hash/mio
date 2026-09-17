import { deviceVoiceProvider } from './DeviceVoiceProvider';
import { productionSynthesisVoiceProvider } from './ProductionSynthesisVoiceProvider';
import type { MioLocale, MioTranscriptionResult, MioVoiceProvider, MioVoiceProviderCapability } from './MioVoiceProvider';
import { mioVoiceProviders, type MioVoiceProviderRegistry } from './MioVoiceProviderRegistry';

export type MioVoiceRuntimeState = 'IDLE' | 'LISTENING' | 'SPEAKING';
export type MioVoiceRuntimeListener = (state: MioVoiceRuntimeState) => void;

/** Provider-neutral runtime facade for Mio Voice V3 with V4 production TTS preference. */
export class MioVoiceRuntimeV3 {
  private state: MioVoiceRuntimeState = 'IDLE'; private listeners = new Set<MioVoiceRuntimeListener>(); private activeController: AbortController | null = null; private activeProviderId: string | null = null;
  constructor(private readonly registry: MioVoiceProviderRegistry = mioVoiceProviders) {}
  getState() { return this.state; } getActiveProviderId() { return this.activeProviderId; }
  subscribe(listener: MioVoiceRuntimeListener): () => void { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); }; }
  private setState(state: MioVoiceRuntimeState) { if (this.state === state) return; this.state = state; for (const listener of this.listeners) listener(state); }
  private async select(capability: MioVoiceProviderCapability, preferredProviderId?: string) { const selected = await this.registry.select(capability, preferredProviderId); if (!selected) throw new Error(`No available Mio voice provider supports ${capability}.`); return selected.provider; }
  private settle(controller: AbortController) { if (this.activeController !== controller) return; this.activeController = null; this.activeProviderId = null; this.setState('IDLE'); }

  async interrupt(): Promise<void> {
    const controller = this.activeController; const provider = this.activeProviderId ? this.registry.get(this.activeProviderId) : undefined;
    controller?.abort();
    await Promise.allSettled([provider?.stopSpeaking(), provider?.stopListening?.()]);
    if (controller) this.settle(controller); else { this.activeProviderId = null; this.setState('IDLE'); }
  }

  private async speakWithProvider(provider: MioVoiceProvider, text: string, locale: MioLocale, controller: AbortController): Promise<void> {
    this.activeProviderId = provider.id;
    await provider.speak({ text, locale, signal: controller.signal });
  }

  async speak(text: string, locale: MioLocale, preferredProviderId = productionSynthesisVoiceProvider.id): Promise<void> {
    await this.interrupt();
    const provider = await this.select('TTS', preferredProviderId);
    const controller = new AbortController(); this.activeController = controller; this.activeProviderId = provider.id; this.setState('SPEAKING');
    try {
      await this.speakWithProvider(provider, text, locale, controller);
    } catch (error) {
      if (controller.signal.aborted) return;
      // A provider may pass readiness and still fail during synthesis/playback. Keep Mio audible by retrying once with device TTS.
      if (provider.id !== deviceVoiceProvider.id) {
        await Promise.allSettled([provider.stopSpeaking()]);
        const fallback = await this.registry.select('TTS', deviceVoiceProvider.id);
        if (fallback && fallback.provider.id !== provider.id && !controller.signal.aborted) {
          await this.speakWithProvider(fallback.provider, text, locale, controller);
          return;
        }
      }
      throw error;
    } finally { this.settle(controller); }
  }

  async listen(locale: MioLocale, onResult: (result: MioTranscriptionResult) => void, preferredProviderId?: string): Promise<void> {
    await this.interrupt(); const provider = await this.select('STT', preferredProviderId); if (!provider.startListening) throw new Error(`Provider ${provider.id} does not implement STT.`);
    const controller = new AbortController(); this.activeController = controller; this.activeProviderId = provider.id; this.setState('LISTENING');
    try { await provider.startListening({ locale, signal: controller.signal }, onResult); } catch (error) { if (!controller.signal.aborted) throw error; } finally { this.settle(controller); }
  }
}

// Register production first so TTS prefers Mio's stable synthesis identity. Device speech remains fallback and STT provider.
mioVoiceProviders.register(productionSynthesisVoiceProvider);
mioVoiceProviders.register(deviceVoiceProvider);
export const mioVoiceRuntimeV3 = new MioVoiceRuntimeV3();
