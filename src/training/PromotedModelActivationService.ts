import { createLocalInferenceBackend, defaultLocalInferenceEndpoint } from '../intelligence/model/LocalInferenceBackend';
import { systemPreferences } from '../settings/SystemPreferences';
import { LocalInferenceBackendId, ModelRouterConfig } from '../types/models';
import { MioModelManifest, validateModelManifest } from './ModelManifest';
import { ModelManifestRepository } from './ModelManifestRepository';

export type PromotedModelRuntimeState = 'NONE' | 'READY_TO_ACTIVATE' | 'ACTIVE' | 'CONFIGURATION_DRIFT';

export interface PromotedModelRuntimeStatus {
  state: PromotedModelRuntimeState;
  manifest?: MioModelManifest;
  configuredProvider: ModelRouterConfig['provider'];
  configuredModel?: string;
  backend: LocalInferenceBackendId;
  endpoint?: string;
  detail: string;
}

export interface PromotedModelActivationResult {
  manifest: MioModelManifest;
  backend: LocalInferenceBackendId;
  endpoint: string;
  readinessDetail: string;
}

export interface PromotedModelActivationOptions {
  backend?: LocalInferenceBackendId;
  endpoint?: string;
  timeoutMs?: number;
}

export interface ModelRouterPreferencePort {
  getModelRouter(): ModelRouterConfig;
  setModelRouter(patch: Partial<ModelRouterConfig>): Promise<void>;
}

const defaultPreferencePort: ModelRouterPreferencePort = {
  getModelRouter: () => systemPreferences.getSnapshot().modelRouter,
  setModelRouter: (patch) => systemPreferences.setModelRouter(patch),
};

export class PromotedModelActivationService {
  constructor(
    private readonly manifests: ModelManifestRepository = new ModelManifestRepository(),
    private readonly preferences: ModelRouterPreferencePort = defaultPreferencePort,
  ) {}

  public async listPromoted(limit = 100): Promise<MioModelManifest[]> {
    return (await this.manifests.list(limit)).filter((manifest) => manifest.lifecycle === 'PROMOTED');
  }

  public async status(): Promise<PromotedModelRuntimeStatus> {
    const config = this.preferences.getModelRouter();
    const manifest = await this.manifests.getActivePromoted();
    const backend = config.mioLocalBackend ?? 'ollama';
    if (!manifest) {
      return {
        state: 'NONE',
        configuredProvider: config.provider,
        configuredModel: config.model,
        backend,
        endpoint: config.mioLocalEndpoint,
        detail: 'No promoted MIO Local model is selected in the model manifest registry.',
      };
    }

    const modelMatches = config.model === manifest.runtimeModel;
    const localSelected = config.provider === 'mio_local';
    if (localSelected && modelMatches) {
      return {
        state: 'ACTIVE',
        manifest,
        configuredProvider: config.provider,
        configuredModel: config.model,
        backend,
        endpoint: config.mioLocalEndpoint,
        detail: `${manifest.displayName} is the active promoted model configured for MIO Local.`,
      };
    }

    return {
      state: localSelected ? 'CONFIGURATION_DRIFT' : 'READY_TO_ACTIVATE',
      manifest,
      configuredProvider: config.provider,
      configuredModel: config.model,
      backend,
      endpoint: config.mioLocalEndpoint,
      detail: localSelected
        ? `Promoted model '${manifest.runtimeModel}' differs from configured MIO Local model '${config.model ?? 'none'}'.`
        : `${manifest.displayName} is promoted but MIO Local is not the selected inference provider.`,
    };
  }

  public async activateActivePromoted(options: PromotedModelActivationOptions = {}): Promise<PromotedModelActivationResult> {
    const manifest = await this.manifests.getActivePromoted();
    if (!manifest) throw new Error('No active PROMOTED model manifest is available for runtime activation');
    return this.activateManifest(manifest, options, false);
  }

  public async activatePromoted(manifestId: string, options: PromotedModelActivationOptions = {}): Promise<PromotedModelActivationResult> {
    const manifest = await this.manifests.get(manifestId);
    if (!manifest) throw new Error(`Model manifest '${manifestId}' was not found`);
    return this.activateManifest(manifest, options, true);
  }

  private async activateManifest(
    manifest: MioModelManifest,
    options: PromotedModelActivationOptions,
    updateActivePointer: boolean,
  ): Promise<PromotedModelActivationResult> {
    const validation = validateModelManifest(manifest);
    if (!validation.valid) throw new Error(`Promoted model activation blocked: ${validation.errors.join('; ')}`);
    if (manifest.lifecycle !== 'PROMOTED') throw new Error(`Model '${manifest.id}' is ${manifest.lifecycle}; only PROMOTED models can be activated`);
    if (!manifest.review.dataGovernanceReviewed || !manifest.review.securityReviewed) {
      throw new Error('Promoted model activation requires completed data-governance and security review');
    }

    const current = this.preferences.getModelRouter();
    const backend = options.backend ?? current.mioLocalBackend ?? 'ollama';
    const endpoint = options.endpoint?.trim()
      || (current.mioLocalBackend === backend ? current.mioLocalEndpoint : undefined)
      || defaultLocalInferenceEndpoint(backend);
    const runtime = createLocalInferenceBackend(backend, endpoint, manifest.runtimeModel);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(options.timeoutMs ?? 8000, 30_000)));
    let readiness;
    try {
      readiness = await runtime.checkReadiness(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Promoted model readiness timed out for ${runtime.displayName}`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!readiness.ready) {
      throw new Error(`Promoted model is not ready on ${runtime.displayName}: ${readiness.detail}`);
    }

    const previous = { ...current };
    try {
      await this.preferences.setModelRouter({
        provider: 'mio_local',
        model: manifest.runtimeModel,
        mioLocalBackend: backend,
        mioLocalEndpoint: runtime.endpoint,
      });
      if (updateActivePointer) await this.manifests.setActivePromoted(manifest);
    } catch (error) {
      await this.preferences.setModelRouter(previous).catch(() => undefined);
      throw error;
    }

    return {
      manifest,
      backend,
      endpoint: runtime.endpoint,
      readinessDetail: readiness.detail,
    };
  }
}

export const promotedModelActivationService = new PromotedModelActivationService();
