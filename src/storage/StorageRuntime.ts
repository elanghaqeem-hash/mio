import { InMemoryStorageProvider } from './InMemoryStorageProvider';
import { StorageProvider } from './StorageProvider';
import { IndexedDbStorageProvider } from './web/IndexedDbStorageProvider';

const createDefaultProvider = (): StorageProvider => {
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDbStorageProvider();
  }
  return new InMemoryStorageProvider();
};

export const defaultStorageProvider: StorageProvider = createDefaultProvider();
