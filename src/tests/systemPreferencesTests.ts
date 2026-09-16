import { systemPreferences } from '../settings/SystemPreferences';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { ModelRouter } from '../agents/ModelRouter';

export async function runSystemPreferencesTests(): Promise<{ passed: number; total: number }> {
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

  const storage = new InMemoryStorageProvider();
  systemPreferences.setStorageProvider(storage);
  await systemPreferences.initialize();
  await systemPreferences.setAutonomyLevel('AUTONOMOUS');
  await systemPreferences.setNetworkState('ONLINE');
  await systemPreferences.setModelRouter({
    provider: 'mio_local',
    model: 'Qwen/Qwen3-8B',
    mioLocalBackend: 'vllm',
    mioLocalEndpoint: 'http://127.0.0.1:8000',
    allowOfflineFallback: false,
    enableWebSearch: true,
    enableBrowserRead: true,
  });

  systemPreferences.setStorageProvider(storage);
  await systemPreferences.initialize();
  const restored = systemPreferences.getSnapshot();
  assert(restored.autonomyLevel === 'AUTONOMOUS', 'Autonomy level survives workspace remount/runtime reinitialization');
  assert(restored.networkState === 'ONLINE', 'Network selection is restored from controlled settings storage');
  assert(restored.modelRouter.provider === 'mio_local' && restored.modelRouter.model === 'Qwen/Qwen3-8B', 'Selected provider and model are restored');
  assert(restored.modelRouter.mioLocalBackend === 'vllm' && restored.modelRouter.mioLocalEndpoint === 'http://127.0.0.1:8000', 'MIO Local backend and endpoint survive runtime reinitialization');
  assert(restored.modelRouter.allowOfflineFallback === false, 'Online provider does not silently opt into local fallback');
  assert(restored.modelRouter.enableWebSearch === true, 'Live web-search preference is restored');
  assert(restored.modelRouter.enableBrowserRead === true, 'Governed desktop browser-read preference is restored');
  assert(ModelRouter.getNetworkState() === 'ONLINE'
    && ModelRouter.getConfig().provider === 'mio_local'
    && ModelRouter.getConfig().mioLocalBackend === 'vllm'
    && ModelRouter.getConfig().enableBrowserRead === true,
  'Restored preferences including browser capability are applied to ModelRouter before use');

  return { passed, total };
}
