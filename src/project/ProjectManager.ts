import { MioProject, ProjectAsset, AssetType, AssetOrigin } from '../types/project';
import { eventBus } from '../core/EventBus';

export class ProjectManager {
  private static currentProject: MioProject = {
    id: 'proj_default',
    name: 'MIO Project',
    description: 'Local MIO project workspace.',
    createdAt: Date.now(),
    lastModified: Date.now(),
    activeMode: 'CHAT',
    assets: [],
    references: [],
    versions: [],
    activityLog: [],
    securityLog: [],
  };

  public static async hydrate(): Promise<void> {
    if (!window.mioDesktop) return;
    const stored = await window.mioDesktop.loadProject(this.currentProject.id);
    if (stored && typeof stored === 'object' && stored.id === this.currentProject.id && Array.isArray(stored.assets)) {
      this.currentProject = stored as MioProject;
    } else {
      await this.persist();
    }
    eventBus.emit('PROJECT_UPDATED', { ...this.currentProject });
  }

  private static async persist() {
    if (window.mioDesktop) await window.mioDesktop.saveProject(this.currentProject);
  }

  public static async saveCurrent(): Promise<void> { await this.persist(); }

  private static changed(message?: string) {
    this.currentProject.lastModified = Date.now();
    if (message) this.currentProject.activityLog.unshift({ timestamp: Date.now(), message, mode: 'PROJECT' });
    eventBus.emit('PROJECT_UPDATED', { ...this.currentProject });
    void this.persist();
  }

  public static getProject(): MioProject { return this.currentProject; }

  public static addAsset(asset: Omit<ProjectAsset, 'id' | 'createdAt' | 'updatedAt' | 'version'>): ProjectAsset {
    const newAsset: ProjectAsset = { ...asset, id: `asset_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, version: 1, createdAt: Date.now(), updatedAt: Date.now() };
    this.currentProject.assets.push(newAsset);
    this.changed(`Added ${newAsset.origin} asset: ${newAsset.name}`);
    return newAsset;
  }

  public static updateAssetData(assetId: string, data: any, origin: AssetOrigin = 'USER-EDITED') {
    const asset = this.currentProject.assets.find((a) => a.id === assetId);
    if (!asset) return;
    asset.data = data; asset.origin = origin; asset.updatedAt = Date.now(); asset.version += 1;
    this.changed(`Updated asset: ${asset.name}`);
  }

  public static getAssetByType(type: AssetType): ProjectAsset | undefined { return this.currentProject.assets.find((a) => a.type === type); }
  public static updateMode(mode: any) { this.currentProject.activeMode = mode; this.changed(); }

  public static renameProject(name: string, description?: string) {
    const safeName = name.trim().slice(0, 200);
    if (!safeName) throw new Error('Project name is required');
    this.currentProject.name = safeName;
    if (typeof description === 'string') this.currentProject.description = description.slice(0, 2000);
    this.changed('Updated project metadata');
  }

  public static replaceProject(project: MioProject, message = 'Project state restored from snapshot') {
    this.currentProject = project;
    this.changed(message);
  }
}
