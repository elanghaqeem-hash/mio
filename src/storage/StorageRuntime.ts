import { InMemoryStorageProvider } from './InMemoryStorageProvider';
import { ObservableStorageProvider } from './ObservableStorageProvider';
import type { StorageProvider } from './StorageProvider';
import { IndexedDbStorageProvider } from './web/IndexedDbStorageProvider';

const createDefaultProvider = (): StorageProvider => {
  const inner: StorageProvider = typeof indexedDB !== 'undefined'
    ? new IndexedDbStorageProvider()
    : new InMemoryStorageProvider();
  return new ObservableStorageProvider(inner);
};

export const defaultStorageProvider: StorageProvider = createDefaultProvider();
