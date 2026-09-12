import { MioProject, ProjectAsset, AssetType, AssetOrigin, KnowledgeGovernanceAction, KnowledgeSourceGovernanceRecord, KnowledgeSourceTrust } from '../types/project';
import { eventBus } from '../core/EventBus';
import { StorageProvider } from '../storage/StorageProvider';
import { defaultStorageProvider } from '../storage/StorageRuntime';

const PROJECT_STORAGE_KEY = 'current-project';

const createInitialProject = (name = 'MIO Web Lab Workspace', description = 'Persistent project workspace for MIO Technology Preview.'): MioProject => ({
  id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  name,
  description,
  createdAt: Date.now(),
  lastModified: Date.now(),
  activeMode: 'CHAT',
  assets: [],
  references: [],
  versions: [],
  activityLog: [{ timestamp: Date.now(), message: 'Project initialized in controlled MIO workspace', mode: 'PROJECT' }],
  securityLog: [],
  knowledgeGovernance: { sources: {}, history: [], updatedAt: Date.now() },
});

export class ProjectManager {
  private static storage: StorageProvider = defaultStorageProvider;
  private static currentProject: MioProject = createInitialProject();
  private static initialized = false;

  public static async initialize(): Promise<MioProject> {
    try {
      const stored = await this.storage.get<MioProject>('projects', PROJECT_STORAGE_KEY);
      if (stored) this.currentProject = this.normalizeProject(stored);
      else await this.storage.set('projects', PROJECT_STORAGE_KEY, this.currentProject);
      this.initialized = true;
      eventBus.emit('PROJECT_UPDATED', this.currentProject);
      return this.currentProject;
    } catch (error) {
      console.error('[ProjectManager] Persistence initialization failed; continuing with runtime state.', error);
      eventBus.emit('STORAGE_ERROR', { scope: 'PROJECT', action: 'INITIALIZE', error: error instanceof Error ? error.message : String(error) });
      this.initialized = true;
      return this.currentProject;
    }
  }

  public static setStorageProvider(provider: StorageProvider): void { this.storage = provider; this.initialized = false; }
  public static isInitialized(): boolean { return this.initialized; }
  public static getProject(): MioProject { return this.currentProject; }

  public static createProject(name: string, description = ''): MioProject {
    this.currentProject = createInitialProject(name, description);
    this.commitProjectUpdate('Created new project workspace');
    return this.currentProject;
  }

  public static replaceProject(project: MioProject, reason = 'Project state restored'): MioProject {
    this.currentProject = this.normalizeProject(project);
    this.currentProject.lastModified = Date.now();
    this.currentProject.activityLog.unshift({ timestamp: Date.now(), message: reason, mode: 'PROJECT' });
    this.commitProjectUpdate();
    return this.currentProject;
  }

  public static addAsset(asset: Omit<ProjectAsset, 'id' | 'createdAt' | 'updatedAt' | 'version'>): ProjectAsset {
    const newAsset: ProjectAsset = { ...asset, id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, version: 1, createdAt: Date.now(), updatedAt: Date.now() };
    this.currentProject.assets.push(newAsset);
    if (newAsset.type === 'document') {
      this.ensureKnowledgeGovernance(newAsset);
      this.appendGovernanceEvent(newAsset.id, 'REGISTERED', 'SYSTEM', { trust: newAsset.verified ? 'VERIFIED' : 'QUARANTINED', included: true, note: `Registered ${newAsset.origin} document source` });
    }
    this.currentProject.activityLog.unshift({ timestamp: Date.now(), message: `Added ${newAsset.origin} asset: ${newAsset.name}`, mode: 'PROJECT' });
    this.commitProjectUpdate();
    return newAsset;
  }

  public static updateAssetData(assetId: string, data: any, origin: AssetOrigin = 'USER-EDITED'): void {
    const asset = this.currentProject.assets.find((item) => item.id === assetId);
    if (!asset) return;
    asset.data = data;
    asset.origin = origin;
    asset.updatedAt = Date.now();
    asset.version += 1;
    this.commitProjectUpdate(`Updated asset: ${asset.name}`);
  }

  public static getAssetByType(type: AssetType): ProjectAsset | undefined { return this.currentProject.assets.find((asset) => asset.type === type); }
  public static getKnowledgeGovernance(assetId: string): KnowledgeSourceGovernanceRecord | undefined { return this.currentProject.knowledgeGovernance.sources[assetId]; }

  public static setKnowledgeSourceIncluded(assetId: string, included: boolean): boolean {
    const asset = this.currentProject.assets.find((item) => item.id === assetId && item.type === 'document');
    if (!asset) return false;
    const record = this.ensureKnowledgeGovernance(asset);
    record.included = included;
    record.updatedAt = Date.now();
    this.currentProject.knowledgeGovernance.updatedAt = record.updatedAt;
    this.appendGovernanceEvent(assetId, included ? 'INCLUDED' : 'EXCLUDED', 'USER', { included, trust: record.trust });
    this.commitProjectUpdate(`${included ? 'Included' : 'Excluded'} knowledge source: ${asset.name}`);
    return true;
  }

  public static reviewKnowledgeSource(assetId: string, trust: KnowledgeSourceTrust, note?: string, freshUntil?: number): boolean {
    const asset = this.currentProject.assets.find((item) => item.id === assetId && item.type === 'document');
    if (!asset) return false;
    const record = this.ensureKnowledgeGovernance(asset);
    record.trust = trust;
    record.reviewedAt = Date.now();
    record.reviewNote = note;
    record.freshUntil = freshUntil;
    record.updatedAt = Date.now();
    asset.verified = trust === 'VERIFIED';
    this.currentProject.knowledgeGovernance.updatedAt = record.updatedAt;
    this.appendGovernanceEvent(assetId, 'REVIEWED', 'USER', { trust, included: record.included, note, freshUntil });
    this.commitProjectUpdate(`Reviewed knowledge source ${asset.name} as ${trust}`);
    return true;
  }

  public static supersedeKnowledgeSource(assetId: string, replacementAssetId: string): boolean {
    const asset = this.currentProject.assets.find((item) => item.id === assetId && item.type === 'document');
    const replacement = this.currentProject.assets.find((item) => item.id === replacementAssetId && item.type === 'document');
    if (!asset || !replacement || assetId === replacementAssetId) return false;
    const record = this.ensureKnowledgeGovernance(asset);
    this.ensureKnowledgeGovernance(replacement);
    record.supersededByAssetId = replacementAssetId;
    record.included = false;
    record.updatedAt = Date.now();
    this.currentProject.knowledgeGovernance.updatedAt = record.updatedAt;
    this.appendGovernanceEvent(assetId, 'SUPERSEDED', 'USER', { trust: record.trust, included: false, replacementAssetId, note: `Replaced by ${replacement.name}` });
    this.commitProjectUpdate(`Superseded knowledge source ${asset.name} with ${replacement.name}`);
    return true;
  }

  public static updateMode(mode: MioProject['activeMode']): void { this.currentProject.activeMode = mode; this.commitProjectUpdate(); }

  public static commitProjectUpdate(activityMessage?: string): void {
    this.currentProject.lastModified = Date.now();
    if (activityMessage) this.currentProject.activityLog.unshift({ timestamp: Date.now(), message: activityMessage, mode: 'PROJECT' });
    eventBus.emit('PROJECT_UPDATED', this.currentProject);
    void this.flush();
  }

  public static async flush(): Promise<void> {
    try { await this.storage.set('projects', PROJECT_STORAGE_KEY, this.currentProject); }
    catch (error) {
      console.error('[ProjectManager] Failed to persist project state.', error);
      eventBus.emit('STORAGE_ERROR', { scope: 'PROJECT', action: 'WRITE', error: error instanceof Error ? error.message : String(error) });
    }
  }

  private static appendGovernanceEvent(assetId: string, action: KnowledgeGovernanceAction, actor: 'USER' | 'SYSTEM', details: { trust?: KnowledgeSourceTrust; included?: boolean; note?: string; freshUntil?: number; replacementAssetId?: string } = {}): void {
    const timestamp = Date.now();
    this.currentProject.knowledgeGovernance.history.unshift({
      id: `kg_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
      assetId,
      action,
      timestamp,
      actor,
      ...details,
    });
    this.currentProject.knowledgeGovernance.history = this.currentProject.knowledgeGovernance.history.slice(0, 500);
    this.currentProject.knowledgeGovernance.updatedAt = timestamp;
  }

  private static ensureKnowledgeGovernance(asset: ProjectAsset): KnowledgeSourceGovernanceRecord {
    const existing = this.currentProject.knowledgeGovernance.sources[asset.id];
    if (existing) return existing;
    const record: KnowledgeSourceGovernanceRecord = { assetId: asset.id, included: true, trust: asset.verified ? 'VERIFIED' : 'QUARANTINED', updatedAt: Date.now() };
    this.currentProject.knowledgeGovernance.sources[asset.id] = record;
    this.currentProject.knowledgeGovernance.updatedAt = record.updatedAt;
    return record;
  }

  private static normalizeProject(project: MioProject): MioProject {
    const normalized: MioProject = {
      ...project,
      assets: Array.isArray(project.assets) ? project.assets : [],
      references: Array.isArray(project.references) ? project.references : [],
      versions: Array.isArray(project.versions) ? project.versions : [],
      activityLog: Array.isArray(project.activityLog) ? project.activityLog : [],
      securityLog: Array.isArray(project.securityLog) ? project.securityLog : [],
      knowledgeGovernance: project.knowledgeGovernance && typeof project.knowledgeGovernance.sources === 'object'
        ? { ...project.knowledgeGovernance, history: Array.isArray(project.knowledgeGovernance.history) ? project.knowledgeGovernance.history : [] }
        : { sources: {}, history: [], updatedAt: Date.now() },
    };
    for (const asset of normalized.assets.filter((item) => item.type === 'document')) {
      if (!normalized.knowledgeGovernance.sources[asset.id]) {
        normalized.knowledgeGovernance.sources[asset.id] = { assetId: asset.id, included: true, trust: asset.verified ? 'VERIFIED' : 'QUARANTINED', updatedAt: asset.updatedAt || Date.now() };
      }
    }
    return normalized;
  }
}
