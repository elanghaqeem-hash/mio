export type StorageNamespace = 'projects' | 'creative' | 'memory' | 'settings' | 'runtime';

export interface StorageProvider {
  get<T>(namespace: StorageNamespace, key: string): Promise<T | null>;
  set<T>(namespace: StorageNamespace, key: string, value: T): Promise<void>;
  delete(namespace: StorageNamespace, key: string): Promise<void>;
  listKeys(namespace: StorageNamespace): Promise<string[]>;
  clearNamespace(namespace: StorageNamespace): Promise<void>;
}
