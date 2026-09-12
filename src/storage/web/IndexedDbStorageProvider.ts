import { StorageNamespace, StorageProvider } from '../StorageProvider';

const DB_NAME = 'mio-web-lab';
const DB_VERSION = 1;
const STORE_NAME = 'key_value';

export class IndexedDbStorageProvider implements StorageProvider {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private buildKey(namespace: StorageNamespace, key: string): string {
    return `${namespace}:${key}`;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not available in this runtime'));
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
      });
    }

    return this.dbPromise;
  }

  private async runRequest<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.openDatabase();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    });
  }

  public async get<T>(namespace: StorageNamespace, key: string): Promise<T | null> {
    const value = await this.runRequest<unknown>('readonly', (store) => store.get(this.buildKey(namespace, key)));
    return value === undefined ? null : (value as T);
  }

  public async set<T>(namespace: StorageNamespace, key: string, value: T): Promise<void> {
    await this.runRequest<IDBValidKey>('readwrite', (store) => store.put(value, this.buildKey(namespace, key)));
  }

  public async delete(namespace: StorageNamespace, key: string): Promise<void> {
    await this.runRequest<undefined>('readwrite', (store) => store.delete(this.buildKey(namespace, key)));
  }

  public async listKeys(namespace: StorageNamespace): Promise<string[]> {
    const keys = await this.runRequest<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
    const prefix = `${namespace}:`;
    return keys
      .map(String)
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }

  public async clearNamespace(namespace: StorageNamespace): Promise<void> {
    const keys = await this.listKeys(namespace);
    await Promise.all(keys.map((key) => this.delete(namespace, key)));
  }
}
