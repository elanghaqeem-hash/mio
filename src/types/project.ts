import { MioSystemMode } from './core';
import { SecurityEvent } from './security';

export type AssetOrigin = 'GENERATED' | 'VERIFIED' | 'USER-EDITED' | 'IMPORTED' | 'AI-SUGGESTED';
export type AssetType = '3d' | 'animation' | 'graphic' | 'sfx' | 'music' | 'document' | 'reference';
export type KnowledgeSourceTrust = 'VERIFIED' | 'QUARANTINED';
export type KnowledgeFreshness = 'CURRENT' | 'STALE' | 'UNKNOWN';
export type KnowledgeGovernanceAction = 'REGISTERED' | 'INCLUDED' | 'EXCLUDED' | 'REVIEWED' | 'SUPERSEDED';

export interface KnowledgeSourceGovernanceRecord {
  assetId: string;
  included: boolean;
  trust: KnowledgeSourceTrust;
  reviewedAt?: number;
  reviewNote?: string;
  freshUntil?: number;
  supersededByAssetId?: string;
  updatedAt: number;
}

export interface KnowledgeGovernanceEvent {
  id: string;
  assetId: string;
  action: KnowledgeGovernanceAction;
  timestamp: number;
  trust?: KnowledgeSourceTrust;
  included?: boolean;
  note?: string;
  freshUntil?: number;
  replacementAssetId?: string;
  actor: 'USER' | 'SYSTEM';
}

export interface KnowledgeGovernanceState {
  sources: Record<string, KnowledgeSourceGovernanceRecord>;
  history: KnowledgeGovernanceEvent[];
  updatedAt: number;
}

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
  data: any;
  verified: boolean;
  notes?: string;
}

export interface ProjectVersion {
  versionId: string;
  timestamp: number;
  description: string;
  snapshot: string;
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
  knowledgeGovernance: KnowledgeGovernanceState;
}
