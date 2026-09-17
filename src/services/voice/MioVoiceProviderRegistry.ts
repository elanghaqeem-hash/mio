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

export interface MioVoiceProviderHealthSnapshot {
  providerId: string;
  status: MioVoiceProviderStatus;
  checkedAt: number;
  consecutiveFailures: number;
}

/** Provider registry with deterministic selection, health isolation, and fallback. */
export class MioVoiceProviderRegistry {
  private readonly providers = new Map<string, MioVoiceProvider>();
  private readonly health = new Map<string, MioVoiceProviderHealthSnapshot>();
  private readonly failureCooldownMs = 15_000;

  register(provider: MioVoiceProvider): () => void {
    this.providers.set(provider.id, provider);
    this.health.delete(provider.id);
    return () => {
      if (this.providers.get(provider.id) === provider) {
        this.providers.delete(provider.id);
        this.health.delete(provider.id);
      }
    };
  }

  get(id: string): MioVoiceProvider | undefined { return this.providers.get(id); }
  list(): MioVoiceProvider[] { return [...this.providers.values()]; }

  getHealthSnapshot(id: string): MioVoiceProviderHealthSnapshot | undefined {
    const snapshot = this.health.get(id);
    return snapshot ? { ...snapshot, status: { ...snapshot.status, capabilities: [...snapshot.status.capabilities] } } : undefined;
  }

  private recordStatus(status: MioVoiceProviderStatus): MioVoiceProviderStatus {
    const previous = this.health.get(status.id);
    this.health.set(status.id, { providerId: status.id, status, checkedAt: Date.now(), consecutiveFailures: status.available ? 0 : (previous?.consecutiveFailures ?? 0) + 1 });
    return status;
  }

  private recordFailure(provider: MioVoiceProvider, error: unknown): MioVoiceProviderStatus {
    const previous = this.health.get(provider.id);
    const status: MioVoiceProviderStatus = { id: provider.id, kind: provider.kind, available: false, capabilities: [], reason: error instanceof Error ? error.message : 'Provider health check failed.' };
    this.health.set(provider.id, { providerId: provider.id, status, checkedAt: Date.now(), consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1 });
    return status;
  }

  private isCoolingDown(providerId: string): boolean {
    const snapshot = this.health.get(providerId);
    return Boolean(snapshot && !snapshot.status.available && Date.now() - snapshot.checkedAt < this.failureCooldownMs);
  }

  async statuses(): Promise<MioVoiceProviderStatus[]> {
    const statuses: MioVoiceProviderStatus[] = [];
    for (const provider of this.list()) {
      try { statuses.push(this.recordStatus(await provider.status())); }
      catch (error) { statuses.push(this.recordFailure(provider, error)); }
    }
    return statuses;
  }

  async select(capability: MioVoiceProviderCapability, preferredProviderId?: string): Promise<MioVoiceProviderSelection | null> {
    const providers = this.list();
    const preferred = preferredProviderId ? this.providers.get(preferredProviderId) : undefined;
    const ordered = preferred ? [preferred, ...providers.filter((provider) => provider !== preferred)] : providers;
    for (const provider of ordered) {
      if (this.isCoolingDown(provider.id)) continue;
      try {
        const status = this.recordStatus(await provider.status());
        if (supportsVoiceCapability(status, capability)) return { provider, status };
      } catch (error) { this.recordFailure(provider, error); }
    }
    return null;
  }
}

export const mioVoiceProviders = new MioVoiceProviderRegistry();
