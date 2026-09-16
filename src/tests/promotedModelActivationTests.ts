import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { MioModelManifest } from '../training/ModelManifest';
import { ModelManifestRepository } from '../training/ModelManifestRepository';
import { ModelRouterPreferencePort, PromotedModelActivationService } from '../training/PromotedModelActivationService';
import { ModelRouterConfig } from '../types/models';

export async function runPromotedModelActivationTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ [PASS] ${name}`);
    } else {
      console.error(`✗ [FAIL] ${name}`);
    }
  };

  const promoted: MioModelManifest = {
    schemaVersion: 1,
    id: 'mio-local-8b-v1',
    runtimeModel: 'mio-local-8b-v1',
    displayName: 'MIO Local 8B v1',
    baseModel: 'Qwen/Qwen3-8B',
    trainingMethod: 'BASE',
    createdAt: 100,
    dataset: { id: 'mio-sft-v1', fingerprint: 'sha256:12345678abcdef', exampleCount: 1200 },
    benchmarkPolicy: {
      minPassRate: 0.9,
      minScoreRatio: 0.9,
      requiredDomains: ['REASONING', 'SAFETY'],
      maxAverageLatencyMs: 5000,
    },
    review: {
      dataGovernanceReviewed: true,
      securityReviewed: true,
      reviewer: 'reviewer',
      reviewedAt: 200,
    },
    lifecycle: 'PROMOTED',
  };

  const storage = new InMemoryStorageProvider();
  const repository = new ModelManifestRepository(storage);
  await repository.save(promoted);

  let config: ModelRouterConfig = {
    provider: 'local_heuristic',
    proxyEndpoint: '/api/ai/generate',
    ollamaEndpoint: 'http://127.0.0.1:11434',
    mioLocalBackend: 'ollama',
    mioLocalEndpoint: 'http://127.0.0.1:11434',
    researchEndpoint: '/api/research',
    allowOfflineFallback: false,
    enableWebSearch: false,
  };
  const preferences: ModelRouterPreferencePort = {
    getModelRouter: () => ({ ...config }),
    setModelRouter: async (patch) => { config = { ...config, ...patch }; },
  };
  const service = new PromotedModelActivationService(repository, preferences);

  const initialStatus = await service.status();
  assert(initialStatus.state === 'NONE', 'No active promoted pointer reports NONE even when promoted manifests exist');
  const promotedList = await service.listPromoted();
  assert(promotedList.length === 1 && promotedList[0].id === promoted.id, 'Activation service lists only promoted manifests');

  const originalFetch = globalThis.fetch;
  let discoveryUrl = '';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    discoveryUrl = String(input);
    if (discoveryUrl === 'http://127.0.0.1:8000/v1/models') {
      return new Response(JSON.stringify({ data: [{ id: 'mio-local-8b-v1' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const activated = await service.activatePromoted(promoted.id, { backend: 'vllm' });
    assert(activated.backend === 'vllm' && activated.endpoint === 'http://127.0.0.1:8000', 'Activation uses the selected backend safe default when switching backend families');
    assert(discoveryUrl.endsWith('/v1/models'), 'Activation proves model readiness before committing runtime configuration');
    assert(config.provider === 'mio_local' && config.model === promoted.runtimeModel && config.mioLocalBackend === 'vllm', 'Successful activation configures MIO Local to the promoted runtime model');
    const active = await repository.getActivePromoted();
    assert(active?.id === promoted.id, 'Successful activation persists the selected promoted model pointer');
    const activeStatus = await service.status();
    assert(activeStatus.state === 'ACTIVE' && activeStatus.manifest?.id === promoted.id, 'Runtime status reports ACTIVE only when promoted pointer and configured model agree');

    config = { ...config, model: 'manual-model' };
    const drift = await service.status();
    assert(drift.state === 'CONFIGURATION_DRIFT', 'Manual model changes are detected as promoted-model configuration drift');

    const releaseCandidate: MioModelManifest = { ...promoted, id: 'mio-local-8b-v2-rc', runtimeModel: 'mio-local-8b-v2-rc', lifecycle: 'RELEASE_CANDIDATE' };
    await repository.save(releaseCandidate);
    let rejectedRc = false;
    try { await service.activatePromoted(releaseCandidate.id, { backend: 'vllm' }); } catch { rejectedRc = true; }
    assert(rejectedRc, 'Release-candidate manifests cannot bypass promotion during runtime activation');

    const unavailable: MioModelManifest = { ...promoted, id: 'mio-local-8b-v3', runtimeModel: 'mio-local-8b-v3' };
    await repository.save(unavailable);
    const beforeUnavailable = { ...config };
    let rejectedUnavailable = false;
    try { await service.activatePromoted(unavailable.id, { backend: 'vllm' }); } catch { rejectedUnavailable = true; }
    assert(rejectedUnavailable && config.model === beforeUnavailable.model, 'Unavailable promoted models fail readiness without changing the current runtime config');
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { passed, total };
}
