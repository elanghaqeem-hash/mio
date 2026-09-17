import { eventBus } from '../core/EventBus';
import type { StorageNamespace, StorageProvider } from './StorageProvider';

export const STORAGE_MUTATION_EVENT = 'STORAGE_MUTATION_V1';

export type StorageMutationOperation = 'SET' | 'DELETE' | 'CLEAR_NAMESPACE';

export interface StorageMutationEvent {
  schemaVersion: 1;
  namespace: StorageNamespace;
  operation: StorageMutationOperation;
  key?: string;
  occurredAt: number;
}

export function subscribeStorageMutations(handler: (event: StorageMutationEvent) => void): () => void {
  return eventBus.on<StorageMutationEvent>(STORAGE_MUTATION_EVENT, handler);
}

export class ObservableStorageProvider implements StorageProvider {
  constructor(private readonly inner: StorageProvider) {}

  public get<T>(namespace: StorageNamespace, key: string): Promise<T | null> {
    return this.inner.get<T>(namespace, key);
  }

  public async set<T>(namespace: StorageNamespace, key: string, value: T): Promise<void> {
    await this.inner.set(namespace, key, value);
    this.emit({ namespace, operation: 'SET', key });
  }

  public async delete(namespace: StorageNamespace, key: string): Promise<void> {
    await this.inner.delete(namespace, key);
    this.emit({ namespace, operation: 'DELETE', key });
  }

  public listKeys(namespace: StorageNamespace): Promise<string[]> {
    return this.inner.listKeys(namespace);
  }

  public async clearNamespace(namespace: StorageNamespace): Promise<void> {
    await this.inner.clearNamespace(namespace);
    this.emit({ namespace, operation: 'CLEAR_NAMESPACE' });
  }

  private emit(input: Omit<StorageMutationEvent, 'schemaVersion' | 'occurredAt'>): void {
    eventBus.emit<StorageMutationEvent>(STORAGE_MUTATION_EVENT, {
      schemaVersion: 1,
      ...input,
      occurredAt: Date.now(),
    });
  }
}
