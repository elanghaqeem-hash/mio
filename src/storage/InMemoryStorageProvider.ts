import { StorageNamespace, StorageProvider } from './StorageProvider';

export class InMemoryStorageProvider implements StorageProvider {
  private readonly data = new Map<string, unknown>();

  private buildKey(namespace: StorageNamespace, key: string): string {
    return `${namespace}:${key}`;
  }

  public async get<T>(namespace: StorageNamespace, key: string): Promise<T | null> {
    const value = this.data.get(this.buildKey(namespace, key));
    return value === undefined ? null : (structuredClone(value) as T);
  }

  public async set<T>(namespace: StorageNamespace, key: string, value: T): Promise<void> {
    this.data.set(this.buildKey(namespace, key), structuredClone(value));
  }

  public async delete(namespace: StorageNamespace, key: string): Promise<void> {
    this.data.delete(this.buildKey(namespace, key));
  }

  public async listKeys(namespace: StorageNamespace): Promise<string[]> {
    const prefix = `${namespace}:`;
    return [...this.data.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }

  public async clearNamespace(namespace: StorageNamespace): Promise<void> {
    const prefix = `${namespace}:`;
    for (const key of [...this.data.keys()]) {
      if (key.startsWith(prefix)) this.data.delete(key);
    }
  }
}
