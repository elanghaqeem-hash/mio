import { defaultStorageProvider } from '../storage/StorageRuntime';
import { StorageProvider } from '../storage/StorageProvider';
import { MioBenchReport } from './MioBench';

const NAMESPACE = 'training' as const;
const INDEX_KEY = 'benchmark-report-index-v1';

export interface StoredBenchmarkReport {
  id: string;
  manifestId: string;
  report: MioBenchReport;
  recordedAt: number;
}

export class BenchmarkReportRepository {
  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {}

  public async save(manifestId: string, report: MioBenchReport): Promise<StoredBenchmarkReport> {
    const safeManifestId = manifestId.trim().slice(0, 128);
    if (!safeManifestId) throw new Error('Benchmark report requires manifestId');
    const recordedAt = Date.now();
    const stored: StoredBenchmarkReport = {
      id: `bench:${safeManifestId}:${recordedAt}`,
      manifestId: safeManifestId,
      report: structuredClone(report),
      recordedAt,
    };
    await this.storage.set(NAMESPACE, stored.id, stored);
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    await this.storage.set(NAMESPACE, INDEX_KEY, [stored.id, ...index.filter((id) => id !== stored.id)].slice(0, 2_000));
    return stored;
  }

  public async latestForManifest(manifestId: string): Promise<StoredBenchmarkReport | undefined> {
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    for (const id of index) {
      const item = await this.storage.get<StoredBenchmarkReport>(NAMESPACE, id);
      if (item?.manifestId === manifestId) return item;
    }
    return undefined;
  }

  public async listForManifest(manifestId: string, limit = 20): Promise<StoredBenchmarkReport[]> {
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    const output: StoredBenchmarkReport[] = [];
    for (const id of index) {
      const item = await this.storage.get<StoredBenchmarkReport>(NAMESPACE, id);
      if (item?.manifestId === manifestId) output.push(item);
      if (output.length >= Math.max(1, Math.min(limit, 200))) break;
    }
    return output;
  }
}
