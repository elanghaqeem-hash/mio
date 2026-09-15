import type { MioSystemMode } from './core';

export type CreativePipelineMode = '3D' | 'ANIMATION' | 'SFX' | 'MUSIC' | 'GRAPHIC';
export type CreativePipelineStatus = 'PLANNED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type CreativePipelineStepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'BLOCKED';

export interface CreativePipelineValidationSnapshot {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics?: Record<string, unknown>;
}

export interface CreativePipelineStepRecord {
  id: string;
  mode: CreativePipelineMode;
  action: string;
  assetName: string;
  status: CreativePipelineStepStatus;
  dependsOnStepIds: string[];
  dependsOnAssetIds: string[];
  outputAssetId?: string;
  validation?: CreativePipelineValidationSnapshot;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface CreativePipelineRecord {
  id: string;
  prompt: string;
  status: CreativePipelineStatus;
  steps: CreativePipelineStepRecord[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  snapshotVersionId?: string;
  disclosure: string;
}

export interface CreativePipelineAssetLink {
  pipelineId: string;
  stepId: string;
  mode: CreativePipelineMode;
  dependsOnAssetIds: string[];
  sourcePrompt: string;
  generatedAt: number;
}

export const CREATIVE_MODE_TO_SYSTEM_MODE: Record<CreativePipelineMode, MioSystemMode> = {
  '3D': '3D',
  ANIMATION: 'ANIMATION',
  SFX: 'SFX',
  MUSIC: 'MUSIC',
  GRAPHIC: 'GRAPHIC',
};
