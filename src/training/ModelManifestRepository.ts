import { defaultStorageProvider } from '../storage/StorageRuntime';
import { StorageProvider } from '../storage/StorageProvider';
import { MioModelManifest, validateModelManifest } from './ModelManifest';

const NAMESPACE = 'training' as const;
const INDEX_KEY = 'model-manifest-index-v1';
const ACTIVE_KEY = 'active-promoted-model-v1';

export class ModelManifestRepository {
  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {}

  public async save(manifest: MioModelManifest): Promise<void> {
    const validation = validateModelManifest(manifest);
    if (!validation.valid) throw new Error(`Invalid model manifest: ${validation.errors.join('; ')}`);
    const key = this.key(manifest.id);
    await this.storage.set(NAMESPACE, key, structuredClone(manifest));
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    await this.storage.set(NAMESPACE, INDEX_KEY, [manifest.id, ...index.filter((id) => id !== manifest.id)].slice(0, 500));
  }

  public async get(id: string): Promise<MioModelManifest | undefined> {
    return (await this.storage.get<MioModelManifest>(NAMESPACE, this.key(id))) ?? undefined;
  }

  public async list(limit = 100): Promise<MioModelManifest[]> {
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    const output: MioModelManifest[] = [];
    for (const id of index.slice(0, Math.max(1, Math.min(limit, 500)))) {
      const manifest = await this.get(id);
      if (manifest) output.push(manifest);
    }
    return output;
  }

  public async setActivePromoted(manifest: MioModelManifest): Promise<void> {
    if (manifest.lifecycle !== 'PROMOTED') throw new Error('Only PROMOTED model manifests can become active');
    await this.save(manifest);
    await this.storage.set(NAMESPACE, ACTIVE_KEY, manifest.id);
  }

  public async getActivePromoted(): Promise<MioModelManifest | undefined> {
    const activeId = await this.storage.get<string>(NAMESPACE, ACTIVE_KEY);
    if (!activeId) return undefined;
    const manifest = await this.get(activeId);
    return manifest?.lifecycle === 'PROMOTED' ? manifest : undefined;
  }

  private key(id: string): string {
    return `model-manifest:${id.trim().slice(0, 128)}`;
  }
}
