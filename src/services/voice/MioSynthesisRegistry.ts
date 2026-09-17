import type { MioSynthesisProvider, MioSynthesisProviderStatus } from './MioSynthesisProvider';

export interface MioSynthesisSelection {
  provider: MioSynthesisProvider;
  status: MioSynthesisProviderStatus;
}

/** Deterministic registry for licensed Mio production synthesis providers. */
export class MioSynthesisRegistry {
  private readonly providers = new Map<string, MioSynthesisProvider>();

  register(provider: MioSynthesisProvider): () => void {
    this.providers.set(provider.id, provider);
    return () => { if (this.providers.get(provider.id) === provider) this.providers.delete(provider.id); };
  }

  get(id: string): MioSynthesisProvider | undefined { return this.providers.get(id); }
  list(): MioSynthesisProvider[] { return [...this.providers.values()]; }

  async select(preferredProviderId?: string): Promise<MioSynthesisSelection | null> {
    const preferred = preferredProviderId ? this.providers.get(preferredProviderId) : undefined;
    const providers = this.list();
    const ordered = preferred ? [preferred, ...providers.filter((provider) => provider !== preferred)] : providers;
    for (const provider of ordered) {
      try {
        const status = await provider.status();
        if (status.available) return { provider, status };
      } catch { /* isolate provider health failures */ }
    }
    return null;
  }
}

export const mioSynthesisProviders = new MioSynthesisRegistry();
