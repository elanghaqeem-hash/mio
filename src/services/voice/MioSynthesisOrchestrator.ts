import { mioProsodyPlanner, type MioProsodyPlanner } from './MioProsodyPlanner';
import type { MioSynthesisChunk, MioSynthesisProvider } from './MioSynthesisProvider';
import { mioSynthesisProviders, type MioSynthesisRegistry } from './MioSynthesisRegistry';
import type { MioLocale } from './MioVoiceProvider';

export interface MioSynthesisSession {
  providerId: string;
  chunks: AsyncIterable<MioSynthesisChunk>;
  cancel(): Promise<void>;
}

/** Coordinates profile planning and licensed production synthesis selection. */
export class MioSynthesisOrchestrator {
  private activeProvider: MioSynthesisProvider | null = null;
  private activeController: AbortController | null = null;

  constructor(
    private readonly registry: MioSynthesisRegistry = mioSynthesisProviders,
    private readonly planner: MioProsodyPlanner = mioProsodyPlanner,
  ) {}

  async status(): Promise<'READY' | 'UNCONFIGURED'> {
    return (await this.registry.select()) ? 'READY' : 'UNCONFIGURED';
  }

  async start(text: string, locale: MioLocale, preferredProviderId?: string): Promise<MioSynthesisSession | null> {
    await this.stop();
    const selected = await this.registry.select(preferredProviderId);
    if (!selected) return null;
    const controller = new AbortController();
    const plan = this.planner.plan(text, locale);
    this.activeController = controller;
    this.activeProvider = selected.provider;
    const chunks = selected.provider.synthesize({ text, locale, profile: plan.profile, signal: controller.signal });
    const provider = selected.provider;
    return {
      providerId: provider.id,
      chunks,
      cancel: async () => {
        controller.abort();
        await provider.stop();
        if (this.activeController === controller) { this.activeController = null; this.activeProvider = null; }
      },
    };
  }

  async stop(): Promise<void> {
    const controller = this.activeController;
    const provider = this.activeProvider;
    this.activeController = null;
    this.activeProvider = null;
    controller?.abort();
    if (provider) await provider.stop();
  }
}

export const mioSynthesisOrchestrator = new MioSynthesisOrchestrator();
