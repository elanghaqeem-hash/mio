import { MioSystemMode } from './core';
import { SecurityEvent } from './security';

export type AssetOrigin = 'GENERATED' | 'VERIFIED' | 'USER-EDITED' | 'IMPORTED' | 'AI-SUGGESTED';

export type AssetType = '3d' | 'animation' | 'graphic' | 'sfx' | 'music' | 'document' | 'reference';

export interface ProjectAsset {
  id: string;
  name: string;
  type: AssetType;
  origin: AssetOrigin;
  version: number;
  createdAt: number;
  updatedAt: number;
  sizeBytes?: number;
  filePath: string;
  data: any; // specific data payload for the asset type
  verified: boolean;
  notes?: string;
}

export interface ProjectVersion {
  versionId: string;
  timestamp: number;
  description: string;
  snapshot: string; // JSON serialized state
}

export interface MioProject {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  lastModified: number;
  activeMode: MioSystemMode;
  assets: ProjectAsset[];
  references: { id: string; name: string; url?: string; localPath?: string }[];
  versions: ProjectVersion[];
  activityLog: { timestamp: number; message: string; mode: MioSystemMode }[];
  securityLog: SecurityEvent[];
}
