import { MioProject, ProjectAsset, AssetType, AssetOrigin } from '../types/project';
import { eventBus } from '../core/EventBus';

export class ProjectManager {
  private static currentProject: MioProject = {
    id: 'proj_default',
    name: 'Cybernetic Sentinel Vanguard',
    description: 'Unified multimodal project combining 3D mech drone, locomotion animation, kinetic SFX, and cyberpunk music score.',
    createdAt: Date.now() - 7200000,
    lastModified: Date.now(),
    activeMode: 'CHAT',
    assets: [
      {
        id: 'asset_3d_drone',
        name: 'Vanguard_Mech_Core.mio3d',
        type: '3d',
        origin: 'GENERATED',
        version: 1,
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now() - 3600000,
        filePath: 'GENERATED/3D/Vanguard_Mech_Core.mio3d',
        verified: true,
        data: null,
      },
      {
        id: 'asset_anim_hover',
        name: 'Locomotion_Hover.mioanim',
        type: 'animation',
        origin: 'GENERATED',
        version: 1,
        createdAt: Date.now() - 2400000,
        updatedAt: Date.now() - 2400000,
        filePath: 'GENERATED/ANIMATION/Locomotion_Hover.mioanim',
        verified: true,
        data: null,
      },
      {
        id: 'asset_sfx_thruster',
        name: 'Plasma_Thruster.miosfx',
        type: 'sfx',
        origin: 'GENERATED',
        version: 1,
        createdAt: Date.now() - 1800000,
        updatedAt: Date.now() - 1800000,
        filePath: 'GENERATED/SFX/Plasma_Thruster.miosfx',
        verified: true,
        data: null,
      },
      {
        id: 'asset_music_score',
        name: 'Cyberpunk_Aeolian_Theme.miomusic',
        type: 'music',
        origin: 'GENERATED',
        version: 1,
        createdAt: Date.now() - 1200000,
        updatedAt: Date.now() - 1200000,
        filePath: 'GENERATED/MUSIC/Cyberpunk_Aeolian_Theme.miomusic',
        verified: true,
        data: null,
      },
      {
        id: 'asset_art_poster',
        name: 'Vanguard_Briefing_Poster.mioart',
        type: 'graphic',
        origin: 'GENERATED',
        version: 1,
        createdAt: Date.now() - 600000,
        updatedAt: Date.now() - 600000,
        filePath: 'GENERATED/GRAPHIC/Vanguard_Briefing_Poster.mioart',
        verified: true,
        data: null,
      },
    ],
    references: [
      { id: 'ref_1', name: 'Design_Spec_Titan.pdf' }
    ],
    versions: [],
    activityLog: [
      { timestamp: Date.now() - 7200000, message: 'Project initialized in isolated sandbox', mode: 'PROJECT' },
      { timestamp: Date.now() - 3600000, message: 'Generated 3D Mech Core geometry', mode: '3D' },
      { timestamp: Date.now() - 2400000, message: 'Synchronized hover keyframe track', mode: 'ANIMATION' },
      { timestamp: Date.now() - 1800000, message: 'Synthesized plasma thruster procedural SFX', mode: 'SFX' },
      { timestamp: Date.now() - 1200000, message: 'Composed Cyberpunk Aeolian musical score', mode: 'MUSIC' },
      { timestamp: Date.now() - 600000, message: 'Composed Vanguard vector poster layout', mode: 'GRAPHIC' },
    ],
    securityLog: [],
  };

  public static getProject(): MioProject {
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
    this.currentProject.lastModified = Date.now();
    this.currentProject.activityLog.unshift({
      timestamp: Date.now(),
      message: `Added ${newAsset.origin} asset: ${newAsset.name}`,
      mode: (newAsset.type.toUpperCase() as any) || 'PROJECT',
    });

    eventBus.emit('PROJECT_UPDATED', this.currentProject);
    return newAsset;
  }

  public static updateAssetData(assetId: string, data: any, origin: AssetOrigin = 'USER-EDITED') {
    const asset = this.currentProject.assets.find((a) => a.id === assetId);
    if (asset) {
      asset.data = data;
      asset.origin = origin;
      asset.updatedAt = Date.now();
      asset.version += 1;
      this.currentProject.lastModified = Date.now();
      eventBus.emit('PROJECT_UPDATED', this.currentProject);
    }
  }

  public static getAssetByType(type: AssetType): ProjectAsset | undefined {
    return this.currentProject.assets.find((a) => a.type === type);
  }

  public static updateMode(mode: any) {
    this.currentProject.activeMode = mode;
    eventBus.emit('PROJECT_UPDATED', this.currentProject);
  }
}
