import type {
  MioVoiceProvider,
  MioVoiceProviderCapability,
  MioVoiceProviderStatus,
} from './MioVoiceProvider';
import { supportsVoiceCapability } from './MioVoiceProvider';

export interface MioVoiceProviderSelection {
  provider: MioVoiceProvider;
  status: MioVoiceProviderStatus;
}

/**
 * Provider registry for Mio Voice Runtime V3.
 *
 * Selection is deterministic: providers are evaluated in registration order,
 * while callers can optionally prefer one provider id. Unavailable providers
 * are skipped without breaking the voice session, enabling safe fallback from
 * future streaming services to the local/device implementation.
 */
export class MioVoiceProviderRegistry {
  private readonly providers = new Map<string, MioVoiceProvider>();

  register(provider: MioVoiceProvider): () => void {
    this.providers.set(provider.id, provider);
    return () => {
      if (this.providers.get(provider.id) === provider) this.providers.delete(provider.id);
    };
  }

  get(id: string): MioVoiceProvider | undefined {
    return this.providers.get(id);
  }

  list(): MioVoiceProvider[] {
    return [...this.providers.values()];
  }

  async statuses(): Promise<MioVoiceProviderStatus[]> {
    return Promise.all(this.list().map((provider) => provider.status()));
  }

  async select(
    capability: MioVoiceProviderCapability,
    preferredProviderId?: string,
  ): Promise<MioVoiceProviderSelection | null> {
    const providers = this.list();
    const preferred = preferredProviderId ? this.providers.get(preferredProviderId) : undefined;
    const ordered = preferred
      ? [preferred, ...providers.filter((provider) => provider !== preferred)]
      : providers;

    for (const provider of ordered) {
      try {
        const status = await provider.status();
        if (supportsVoiceCapability(status, capability)) return { provider, status };
      } catch {
        // Provider health failures are isolated so another provider can be used.
      }
    }
    return null;
  }
}

export const mioVoiceProviders = new MioVoiceProviderRegistry();
