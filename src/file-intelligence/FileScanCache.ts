import type { FileAsset } from './contracts';

export interface FileScanCacheKey {
  workspaceId: string;
  relativePath: string;
  bytes: number;
  modifiedAtMs?: number;
}

const keyOf = (value: FileScanCacheKey): string =>
  JSON.stringify([value.workspaceId, value.relativePath, value.bytes, value.modifiedAtMs ?? null]);

export class FileScanCache {
  private readonly entries = new Map<string, FileAsset>();

  public get(key: FileScanCacheKey): FileAsset | undefined {
    const asset = this.entries.get(keyOf(key));
    return asset ? structuredClone(asset) : undefined;
  }

  public put(key: FileScanCacheKey, asset: FileAsset): void {
    this.entries.set(keyOf(key), structuredClone(asset));
  }

  public invalidateWorkspace(workspaceId: string): number {
    let removed = 0;
    for (const [key, asset] of this.entries) {
      if (asset.identity.workspaceId === workspaceId) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  public clear(): void { this.entries.clear(); }
  public get size(): number { return this.entries.size; }
}
