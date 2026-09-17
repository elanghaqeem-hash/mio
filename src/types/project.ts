import { MioSystemMode } from './core';
import { SecurityEvent } from './security';
import type { CreativePipelineRecord } from './creativePipeline';

export type AssetOrigin = 'GENERATED' | 'VERIFIED' | 'USER-EDITED' | 'IMPORTED' | 'AI-SUGGESTED';
export type AssetType = '3d' | 'animation' | 'graphic' | 'drawing' | 'photo' | 'motion-2d' | 'sfx' | 'music' | 'document' | 'reference';
export type KnowledgeSourceTrust = 'VERIFIED' | 'QUARANTINED';
export type KnowledgeFreshness = 'CURRENT' | 'STALE' | 'UNKNOWN';
export type KnowledgeSourcePriority = 'PRIMARY' | 'STANDARD' | 'LOW';
export type KnowledgeConflictResolutionStatus = 'ACCEPTED_VARIANCE' | 'PREFER_SOURCE' | 'RESOLVED_BY_SUPERSESSION';
export type KnowledgeGovernanceAction = 'REGISTERED' | 'INCLUDED' | 'EXCLUDED' | 'REVIEWED' | 'SUPERSEDED' | 'PRIORITY_CHANGED' | 'CORROBORATION_GROUP_CREATED' | 'CONFLICT_REVIEWED' | 'LINEAGE_UPDATED';

export interface AssetLineage {
  taskId?: string;
  pipelineId?: string;
  sourceAssetIds: string[];
  generatedAt?: number;
  firstOpenedAt?: number;
  lastEditedAt?: number;
}

export interface KnowledgeSourceLineage {
  upstreamSourceKey?: string;
  derivedFromAssetIds: string[];
  note?: string;
  reviewedAt: number;
}

export interface KnowledgeSourceGovernanceRecord {
  assetId: string;
  included: boolean;
  trust: KnowledgeSourceTrust;
  priority?: KnowledgeSourcePriority;
  reviewedAt?: number;
  reviewNote?: string;
  freshUntil?: number;
  supersededByAssetId?: string;
  lineage?: KnowledgeSourceLineage;
  updatedAt: number;
}

export interface KnowledgeCorroborationGroup { id: string; label: string; assetIds: string[]; createdAt: number; updatedAt: number; }
export interface KnowledgeConflictResolution { conflictKey: string; status: KnowledgeConflictResolutionStatus; note?: string; preferredAssetId?: string; reviewedAt: number; }
export interface KnowledgeGovernanceEvent { id: string; assetId: string; action: KnowledgeGovernanceAction; timestamp: number; trust?: KnowledgeSourceTrust; priority?: KnowledgeSourcePriority; included?: boolean; note?: string; freshUntil?: number; replacementAssetId?: string; conflictKey?: string; upstreamSourceKey?: string; derivedFromAssetIds?: string[]; actor: 'USER' | 'SYSTEM'; }
export interface KnowledgeGovernanceState { sources: Record<string, KnowledgeSourceGovernanceRecord>; corroborationGroups?: KnowledgeCorroborationGroup[]; conflictResolutions?: Record<string, KnowledgeConflictResolution>; history: KnowledgeGovernanceEvent[]; updatedAt: number; }

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
  lineage?: AssetLineage;
}

export interface ProjectVersion { versionId: string; timestamp: number; description: string; snapshot: string; }

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
  creativePipelines?: CreativePipelineRecord[];
  activityLog: { timestamp: number; message: string; mode: MioSystemMode }[];
  securityLog: SecurityEvent[];
  knowledgeGovernance: KnowledgeGovernanceState;
}