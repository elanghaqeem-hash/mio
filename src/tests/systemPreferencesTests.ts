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
    provider: 'openai',
    model: 'test-model',
    allowOfflineFallback: false,
    enableWebSearch: true,
  });

  systemPreferences.setStorageProvider(storage);
  await systemPreferences.initialize();
  const restored = systemPreferences.getSnapshot();
  assert(restored.autonomyLevel === 'AUTONOMOUS', 'Autonomy level survives workspace remount/runtime reinitialization');
  assert(restored.networkState === 'ONLINE', 'Network selection is restored from controlled settings storage');
  assert(restored.modelRouter.provider === 'openai' && restored.modelRouter.model === 'test-model', 'Selected provider and model are restored');
  assert(restored.modelRouter.allowOfflineFallback === false, 'Online provider does not silently opt into local fallback');
  assert(restored.modelRouter.enableWebSearch === true, 'Live web-search preference is restored');
  assert(ModelRouter.getNetworkState() === 'ONLINE' && ModelRouter.getConfig().provider === 'openai', 'Restored preferences are applied to ModelRouter before use');

  return { passed, total };
}
