import { ModelRouter } from '../agents/ModelRouter';
import { defaultStorageProvider } from '../storage/StorageRuntime';
import { StorageProvider } from '../storage/StorageProvider';
import { AutonomyLevel, NetworkState } from '../types/core';
import { ModelProviderId, ModelRouterConfig } from '../types/models';

export interface MioSystemPreferences {
  autonomyLevel: AutonomyLevel;
  networkState: NetworkState;
  modelRouter: ModelRouterConfig;
}

const STORAGE_KEY = 'system-preferences-v1';
const AUTONOMY_LEVELS: AutonomyLevel[] = ['PASSIVE', 'ASSISTIVE', 'PROACTIVE', 'AUTONOMOUS'];
const NETWORK_STATES: NetworkState[] = ['ONLINE', 'OFFLINE'];
const PROVIDERS: ModelProviderId[] = ['mio_local', 'local_heuristic', 'openrouter', 'openai', 'gemini', 'claude', 'ollama'];

const defaults = (): MioSystemPreferences => ({
  autonomyLevel: 'ASSISTIVE',
  networkState: 'OFFLINE',
  modelRouter: {
    provider: 'local_heuristic',
    proxyEndpoint: '/api/ai/generate',
    ollamaEndpoint: 'http://127.0.0.1:11434',
    mioLocalEndpoint: 'http://127.0.0.1:11434',
    researchEndpoint: '/api/research',
    allowOfflineFallback: false,
    enableWebSearch: false,
  },
});

const optionalText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

function normalize(value: unknown): MioSystemPreferences {
  const fallback = defaults();
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<MioSystemPreferences>;
  const router = candidate.modelRouter && typeof candidate.modelRouter === 'object'
    ? candidate.modelRouter as Partial<ModelRouterConfig>
    : {};

  return {
    autonomyLevel: AUTONOMY_LEVELS.includes(candidate.autonomyLevel as AutonomyLevel)
      ? candidate.autonomyLevel as AutonomyLevel
      : fallback.autonomyLevel,
    networkState: NETWORK_STATES.includes(candidate.networkState as NetworkState)
      ? candidate.networkState as NetworkState
      : fallback.networkState,
    modelRouter: {
      provider: PROVIDERS.includes(router.provider as ModelProviderId)
        ? router.provider as ModelProviderId
        : fallback.modelRouter.provider,
      proxyEndpoint: optionalText(router.proxyEndpoint) ?? fallback.modelRouter.proxyEndpoint,
      ollamaEndpoint: optionalText(router.ollamaEndpoint) ?? fallback.modelRouter.ollamaEndpoint,
      mioLocalEndpoint: optionalText(router.mioLocalEndpoint) ?? fallback.modelRouter.mioLocalEndpoint,
      researchEndpoint: optionalText(router.researchEndpoint) ?? fallback.modelRouter.researchEndpoint,
      model: optionalText(router.model),
      allowOfflineFallback: router.allowOfflineFallback === true,
      enableWebSearch: router.enableWebSearch === true,
    },
  };
}

class SystemPreferencesStore {
  private storage: StorageProvider = defaultStorageProvider;
  private preferences = defaults();
  private listeners = new Set<(preferences: MioSystemPreferences) => void>();
  private writeQueue: Promise<void> = Promise.resolve();

  public async initialize(): Promise<void> {
    this.preferences = normalize(await this.storage.get<MioSystemPreferences>('settings', STORAGE_KEY));
    this.applyRuntime();
    this.notify();
  }

  public setStorageProvider(storage: StorageProvider): void {
    this.storage = storage;
    this.preferences = defaults();
    this.writeQueue = Promise.resolve();
    this.applyRuntime();
  }

  public getSnapshot(): MioSystemPreferences {
    return {
      ...this.preferences,
      modelRouter: { ...this.preferences.modelRouter },
    };
  }

  public subscribe(listener: (preferences: MioSystemPreferences) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async setAutonomyLevel(autonomyLevel: AutonomyLevel): Promise<void> {
    await this.update({ autonomyLevel });
  }

  public async setNetworkState(networkState: NetworkState): Promise<void> {
    await this.update({ networkState });
  }

  public async setModelRouter(modelRouter: Partial<ModelRouterConfig>): Promise<void> {
    await this.update({ modelRouter: { ...this.preferences.modelRouter, ...modelRouter } });
  }

  public async update(patch: Partial<MioSystemPreferences>): Promise<void> {
    this.preferences = normalize({
      ...this.preferences,
      ...patch,
      modelRouter: patch.modelRouter ?? this.preferences.modelRouter,
    });
    this.applyRuntime();
    this.notify();
    const snapshot = this.getSnapshot();
    const storage = this.storage;
    const write = this.writeQueue
      .catch(() => undefined)
      .then(() => storage.set('settings', STORAGE_KEY, snapshot));
    this.writeQueue = write;
    await write;
  }

  private applyRuntime(): void {
    ModelRouter.configure(this.preferences.modelRouter);
    ModelRouter.setNetworkState(this.preferences.networkState);
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const systemPreferences = new SystemPreferencesStore();
