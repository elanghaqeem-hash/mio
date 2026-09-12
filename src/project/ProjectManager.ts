import { MioProject, ProjectAsset, AssetType, AssetOrigin } from '../types/project';
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
  activityLog: [
    {
      timestamp: Date.now(),
      message: 'Project initialized in controlled MIO workspace',
      mode: 'PROJECT',
    },
  ],
  securityLog: [],
});

export class ProjectManager {
  private static storage: StorageProvider = defaultStorageProvider;
  private static currentProject: MioProject = createInitialProject();
  private static initialized = false;

  public static async initialize(): Promise<MioProject> {
    try {
      const stored = await this.storage.get<MioProject>('projects', PROJECT_STORAGE_KEY);
      if (stored) {
        this.currentProject = this.normalizeProject(stored);
      } else {
        await this.storage.set('projects', PROJECT_STORAGE_KEY, this.currentProject);
      }
      this.initialized = true;
      eventBus.emit('PROJECT_UPDATED', this.currentProject);
      return this.currentProject;
    } catch (error) {
      console.error('[ProjectManager] Persistence initialization failed; continuing with runtime state.', error);
      eventBus.emit('STORAGE_ERROR', {
        scope: 'PROJECT',
        action: 'INITIALIZE',
        error: error instanceof Error ? error.message : String(error),
      });
      this.initialized = true;
      return this.currentProject;
    }
  }

  public static setStorageProvider(provider: StorageProvider): void {
    this.storage = provider;
    this.initialized = false;
  }

  public static isInitialized(): boolean {
    return this.initialized;
  }

  public static getProject(): MioProject {
    return this.currentProject;
  }

  public static createProject(name: string, description = ''): MioProject {
    this.currentProject = createInitialProject(name, description);
    this.commitProjectUpdate('Created new project workspace');
    return this.currentProject;
  }

  public static replaceProject(project: MioProject, reason = 'Project state restored'): MioProject {
    this.currentProject = this.normalizeProject(project);
    this.currentProject.lastModified = Date.now();
    this.currentProject.activityLog.unshift({
      timestamp: Date.now(),
      message: reason,
      mode: 'PROJECT',
    });
    this.commitProjectUpdate();
    return this.currentProject;
  }

  public static addAsset(asset: Omit<ProjectAsset, 'id' | 'createdAt' | 'updatedAt' | 'version'>): ProjectAsset {
    const newAsset: ProjectAsset = {
      ...asset,
      id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.currentProject.assets.push(newAsset);
    this.currentProject.activityLog.unshift({
      timestamp: Date.now(),
      message: `Added ${newAsset.origin} asset: ${newAsset.name}`,
      mode: (newAsset.type.toUpperCase() as any) || 'PROJECT',
    });
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

  public static getAssetByType(type: AssetType): ProjectAsset | undefined {
    return this.currentProject.assets.find((asset) => asset.type === type);
  }

  public static updateMode(mode: MioProject['activeMode']): void {
    this.currentProject.activeMode = mode;
    this.commitProjectUpdate();
  }

  public static commitProjectUpdate(activityMessage?: string): void {
    this.currentProject.lastModified = Date.now();
    if (activityMessage) {
      this.currentProject.activityLog.unshift({
        timestamp: Date.now(),
        message: activityMessage,
        mode: 'PROJECT',
      });
    }
    eventBus.emit('PROJECT_UPDATED', this.currentProject);
    void this.flush();
  }

  public static async flush(): Promise<void> {
    try {
      await this.storage.set('projects', PROJECT_STORAGE_KEY, this.currentProject);
    } catch (error) {
      console.error('[ProjectManager] Failed to persist project state.', error);
      eventBus.emit('STORAGE_ERROR', {
        scope: 'PROJECT',
        action: 'WRITE',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private static normalizeProject(project: MioProject): MioProject {
    return {
      ...project,
      assets: Array.isArray(project.assets) ? project.assets : [],
      references: Array.isArray(project.references) ? project.references : [],
      versions: Array.isArray(project.versions) ? project.versions : [],
      activityLog: Array.isArray(project.activityLog) ? project.activityLog : [],
      securityLog: Array.isArray(project.securityLog) ? project.securityLog : [],
    };
  }
}
