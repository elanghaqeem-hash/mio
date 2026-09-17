import { subscribeCandidateLifecycleRefresh } from '../modes/settings/CandidateLifecycleRefreshCoordinator';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import {
  ObservableStorageProvider,
  subscribeStorageMutations,
  type StorageMutationEvent,
} from '../storage/ObservableStorageProvider';
import type { StorageNamespace, StorageProvider } from '../storage/StorageProvider';

class FailingSetStorageProvider implements StorageProvider {
  private readonly inner = new InMemoryStorageProvider();

  get<T>(namespace: StorageNamespace, key: string): Promise<T | null> {
    return this.inner.get<T>(namespace, key);
  }

  async set<T>(_namespace: StorageNamespace, _key: string, _value: T): Promise<void> {
    throw new Error('synthetic write failure');
  }

  delete(namespace: StorageNamespace, key: string): Promise<void> {
    return this.inner.delete(namespace, key);
  }

  listKeys(namespace: StorageNamespace): Promise<string[]> {
    return this.inner.listKeys(namespace);
  }

  clearNamespace(namespace: StorageNamespace): Promise<void> {
    return this.inner.clearNamespace(namespace);
  }
}

function mutation(namespace: StorageNamespace, operation: StorageMutationEvent['operation'], key?: string): StorageMutationEvent {
  return {
    schemaVersion: 1,
    namespace,
    operation,
    ...(key ? { key } : {}),
    occurredAt: Date.now(),
  };
}

export async function runCandidateLifecycleLiveRefreshTests(): Promise<{ passed: number; total: number }> {
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

  const inner = new InMemoryStorageProvider();
  const observable = new ObservableStorageProvider(inner);
  const events: StorageMutationEvent[] = [];
  const unsubscribeEvents = subscribeStorageMutations((event) => events.push(event));

  await observable.set('training', 'candidate:test', { secretPayload: 'must-not-be-emitted' });
  const stored = await inner.get<{ secretPayload: string }>('training', 'candidate:test');
  assert(stored?.secretPayload === 'must-not-be-emitted', 'Observable storage persists the original value before invalidation');
  assert(events.length === 1 && events[0].namespace === 'training' && events[0].operation === 'SET' && events[0].key === 'candidate:test', 'Successful training write emits bounded mutation metadata');
  assert(!('value' in (events[0] as unknown as Record<string, unknown>)), 'Storage mutation event never exposes persisted value/content');

  await observable.delete('training', 'candidate:test');
  await observable.clearNamespace('training');
  assert(events.some((event) => event.operation === 'DELETE' && event.key === 'candidate:test'), 'Successful delete emits metadata-only invalidation');
  assert(events.some((event) => event.operation === 'CLEAR_NAMESPACE' && event.key === undefined), 'Namespace clear emits no synthetic key or content');
  unsubscribeEvents();

  let fanoutA = 0;
  let fanoutB = 0;
  let fanoutC = 0;
  const unsubscribeFanoutA = subscribeStorageMutations(() => { fanoutA += 1; });
  const unsubscribeFanoutB = subscribeStorageMutations(() => { fanoutB += 1; });
  const unsubscribeFanoutC = subscribeStorageMutations(() => { fanoutC += 1; });
  await observable.set('training', 'candidate:fanout', { marker: true });
  assert(fanoutA === 1 && fanoutB === 1 && fanoutC === 1, 'One successful storage invalidation fans out independently to queue, pipeline, and runtime-status style subscribers');
  unsubscribeFanoutA();
  unsubscribeFanoutB();
  unsubscribeFanoutC();

  const failedObservable = new ObservableStorageProvider(new FailingSetStorageProvider());
  let failedWriteEvents = 0;
  const unsubscribeFailed = subscribeStorageMutations(() => { failedWriteEvents += 1; });
  try {
    await failedObservable.set('training', 'candidate:failed', { value: 1 });
  } catch {
    // Expected synthetic persistence failure.
  }
  unsubscribeFailed();
  assert(failedWriteEvents === 0, 'Failed persistence emits no false lifecycle invalidation');

  let storageHandler: ((event: StorageMutationEvent) => void) | undefined;
  let preferenceHandler: (() => void) | undefined;
  let storageUnsubscribed = false;
  let preferencesUnsubscribed = false;
  let nextTimerId = 1;
  const timers = new Map<number, () => void>();
  let refreshCount = 0;

  const unsubscribeRefresh = subscribeCandidateLifecycleRefresh(
    () => { refreshCount += 1; },
    {
      debounceMs: 100,
      subscribeStorage: (handler) => {
        storageHandler = handler;
        return () => { storageUnsubscribed = true; };
      },
      subscribePreferences: (handler) => {
        preferenceHandler = handler;
        return () => { preferencesUnsubscribed = true; };
      },
      setTimer: (handler) => {
        const id = nextTimerId++;
        timers.set(id, handler);
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: (timer) => {
        timers.delete(timer as unknown as number);
      },
    },
  );

  storageHandler?.(mutation('settings', 'SET', 'system-preferences-v1'));
  assert(timers.size === 0 && refreshCount === 0, 'Non-training storage mutations do not invalidate the candidate lifecycle pipeline');

  storageHandler?.(mutation('training', 'SET', 'candidate:a'));
  storageHandler?.(mutation('training', 'SET', 'candidate:b'));
  preferenceHandler?.();
  assert(timers.size === 1, 'Training write bursts and router-preference changes coalesce into one debounced refresh');

  const pending = [...timers.entries()][0];
  if (pending) {
    timers.delete(pending[0]);
    pending[1]();
  }
  assert(refreshCount === 1, 'Debounced lifecycle invalidation invokes one read-only refresh callback');

  storageHandler?.(mutation('training', 'DELETE', 'candidate:a'));
  assert(timers.size === 1, 'A later training mutation schedules a new lifecycle refresh');
  unsubscribeRefresh();
  assert(timers.size === 0 && storageUnsubscribed && preferencesUnsubscribed, 'Coordinator unsubscribe cancels pending work and detaches both invalidation sources');

  storageHandler?.(mutation('training', 'SET', 'candidate:after-dispose'));
  preferenceHandler?.();
  assert(refreshCount === 1, 'Disposed refresh coordinator performs no later lifecycle refresh');

  return { passed, total };
}
