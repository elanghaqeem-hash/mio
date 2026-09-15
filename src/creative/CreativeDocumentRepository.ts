import type { StorageProvider } from '../storage/StorageProvider';
import type { CreativeDocument } from '../types/creativeDocument';
import { validateCreativeDocument } from './CreativeDocumentKernel';

const INDEX_KEY = 'document-index';
const documentKey = (id: string): string => `document:${id}`;
const recoveryKey = (id: string): string => `recovery:${id}`;

export class CreativeDocumentRepository {
  public constructor(private readonly storage: StorageProvider) {}

  public async save(document: CreativeDocument): Promise<void> {
    const validation = validateCreativeDocument(document);
    if (!validation.valid) throw new Error(`Cannot persist invalid creative document: ${validation.errors.join(' ')}`);
    await this.storage.set('creative', documentKey(document.id), document);
    const index = await this.listIds();
    if (!index.includes(document.id)) await this.storage.set('creative', INDEX_KEY, [...index, document.id]);
  }

  public async load(id: string): Promise<CreativeDocument | null> {
    const document = await this.storage.get<CreativeDocument>('creative', documentKey(id));
    if (!document) return null;
    const validation = validateCreativeDocument(document);
    if (!validation.valid) throw new Error(`Stored creative document is invalid: ${validation.errors.join(' ')}`);
    return document;
  }

  public async listIds(): Promise<string[]> {
    return (await this.storage.get<string[]>('creative', INDEX_KEY)) ?? [];
  }

  public async saveRecovery(document: CreativeDocument): Promise<void> {
    await this.storage.set('creative', recoveryKey(document.id), { document, savedAt: Date.now() });
  }

  public async loadRecovery(id: string): Promise<{ document: CreativeDocument; savedAt: number } | null> {
    return this.storage.get('creative', recoveryKey(id));
  }

  public async clearRecovery(id: string): Promise<void> {
    await this.storage.delete('creative', recoveryKey(id));
  }

  public async remove(id: string): Promise<void> {
    await this.storage.delete('creative', documentKey(id));
    await this.storage.delete('creative', recoveryKey(id));
    await this.storage.set('creative', INDEX_KEY, (await this.listIds()).filter((candidate) => candidate !== id));
  }
}

export class CreativeAutosaveController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  public constructor(private readonly repository: CreativeDocumentRepository, private readonly delayMs = 750) {}

  public schedule(document: CreativeDocument): void {
    if (this.timer) clearTimeout(this.timer);
    const snapshot = structuredClone(document);
    this.timer = setTimeout(() => { this.timer = null; void this.repository.saveRecovery(snapshot); }, this.delayMs);
  }

  public async flush(document: CreativeDocument): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.repository.save(document);
    await this.repository.clearRecovery(document.id);
  }

  public cancel(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
