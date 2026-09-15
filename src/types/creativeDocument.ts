export const CREATIVE_DOCUMENT_SCHEMA_VERSION = 1;

export type CreativeDocumentKind =
  | '3d'
  | 'animation'
  | 'graphic'
  | 'sfx'
  | 'music'
  | 'motion-2d'
  | 'drawing'
  | 'photo';

export interface CreativeAssetReference {
  id: string;
  name: string;
  mediaType: string;
  source: 'project' | 'embedded' | 'external';
  projectAssetId?: string;
  uri?: string;
  metadata?: Record<string, unknown>;
}

export interface CreativeNode {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  childIds: string[];
  visible: boolean;
  locked: boolean;
  properties: Record<string, unknown>;
  assetReferenceIds?: string[];
}

export interface CreativeKeyframe {
  id: string;
  time: number;
  value: unknown;
  interpolation: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step' | 'bezier';
}

export interface CreativeTimelineTrack {
  id: string;
  nodeId: string;
  property: string;
  keyframes: CreativeKeyframe[];
}

export interface CreativeTimelineModel {
  duration: number;
  fps: number;
  currentTime: number;
  loop: boolean;
  tracks: CreativeTimelineTrack[];
}

export interface CreativeSelectionModel {
  nodeIds: string[];
  primaryNodeId: string | null;
}

export interface CreativeOperationRecord {
  id: string;
  timestamp: number;
  actor: 'user' | 'agent' | 'system';
  action: 'execute' | 'undo' | 'redo' | 'migration';
  command: CreativeCommand;
  revision: number;
}

export interface CreativeDocument {
  schemaVersion: number;
  id: string;
  kind: CreativeDocumentKind;
  name: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  rootNodeIds: string[];
  nodes: Record<string, CreativeNode>;
  assets: Record<string, CreativeAssetReference>;
  selection: CreativeSelectionModel;
  timeline?: CreativeTimelineModel;
  metadata: Record<string, unknown>;
  operations: CreativeOperationRecord[];
}

export interface CreativeRenderJob {
  id: string;
  documentId: string;
  format: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  settings: Record<string, unknown>;
  outputUri?: string;
  error?: string;
}

export type CreativeCommand =
  | { type: 'node.create'; node: CreativeNode; index?: number }
  | { type: 'node.restore'; nodes: CreativeNode[]; placements: Array<{ nodeId: string; parentId: string | null; index: number }> }
  | { type: 'node.update'; nodeId: string; changes: Partial<Omit<CreativeNode, 'id' | 'parentId' | 'childIds'>> }
  | { type: 'node.delete'; nodeId: string }
  | { type: 'node.reorder'; nodeId: string; parentId: string | null; index: number }
  | { type: 'selection.set'; nodeIds: string[]; primaryNodeId: string | null }
  | { type: 'document.update'; changes: { name?: string; metadata?: Record<string, unknown>; timeline?: CreativeTimelineModel | null } }
  | { type: 'batch'; commands: CreativeCommand[] };

export interface CreativeCommandEnvelope {
  id?: string;
  timestamp?: number;
  actor?: 'user' | 'agent' | 'system';
  command: CreativeCommand;
}

export interface CreativeDocumentValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
