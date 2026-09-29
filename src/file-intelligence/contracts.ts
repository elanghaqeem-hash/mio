/**
 * Mio Multimodal File Intelligence — canonical scan contracts.
 *
 * T-1.03#A / T-1.03#B
 *
 * These contracts are deliberately read-only. They describe observations made
 * inside an explicitly authorized workspace and grant no filesystem mutation
 * authority.
 */

export type FileAssetKind =
  | 'TEXT'
  | 'DOCUMENT'
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'ARCHIVE'
  | 'CODE'
  | 'THREE_D'
  | 'CREATIVE'
  | 'BINARY'
  | 'UNKNOWN';

export type FileScanDepth = 'FAST' | 'SMART' | 'DEEP';
export type FileScanState = 'DISCOVERED' | 'METADATA_READY' | 'ANALYSIS_PENDING' | 'ANALYZED' | 'SKIPPED' | 'FAILED';

export interface FileAssetIdentity {
  workspaceId: string;
  relativePath: string;
  name: string;
  extension?: string;
  mimeType?: string;
  kind: FileAssetKind;
}

export interface FileAssetMetadata {
  bytes: number;
  modifiedAtMs?: number;
  createdAtMs?: number;
  sha256?: string;
}

export interface MediaDimensions {
  width?: number;
  height?: number;
  durationMs?: number;
  frameRate?: number;
  channels?: number;
  sampleRateHz?: number;
}

export interface FileAnalysisSignal {
  source: 'METADATA' | 'TEXT' | 'VISION' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'THREE_D';
  label: string;
  confidence?: number;
}

export interface FileAnalysisResult {
  summary?: string;
  tags: string[];
  signals: FileAnalysisSignal[];
  extractedText?: string;
  dimensions?: MediaDimensions;
  analyzerVersion: string;
  analyzedAtMs: number;
}

export interface FileAsset {
  schemaVersion: 1;
  identity: FileAssetIdentity;
  metadata: FileAssetMetadata;
  state: FileScanState;
  analysis?: FileAnalysisResult;
  error?: string;
}

export interface FileScanRequest {
  workspaceId: string;
  relativePath: string;
  depth: FileScanDepth;
  recursive: boolean;
  maxFiles?: number;
  maxBytes?: number;
  maxDepth?: number;
  includeHidden?: boolean;
  excludeNames?: string[];
  excludeExtensions?: string[];
}

export interface FileScanResult {
  schemaVersion: 1;
  workspaceId: string;
  rootRelativePath: string;
  depth: FileScanDepth;
  startedAtMs: number;
  finishedAtMs: number;
  files: FileAsset[];
  skippedCount: number;
  failedCount: number;
}

const EXTENSION_KIND: Readonly<Record<string, FileAssetKind>> = {
  txt: 'TEXT', md: 'TEXT', csv: 'TEXT', json: 'TEXT',
  pdf: 'DOCUMENT', doc: 'DOCUMENT', docx: 'DOCUMENT', xls: 'DOCUMENT', xlsx: 'DOCUMENT', ppt: 'DOCUMENT', pptx: 'DOCUMENT',
  jpg: 'IMAGE', jpeg: 'IMAGE', png: 'IMAGE', webp: 'IMAGE', gif: 'IMAGE', heic: 'IMAGE', heif: 'IMAGE', tiff: 'IMAGE', bmp: 'IMAGE',
  mp4: 'VIDEO', mov: 'VIDEO', mkv: 'VIDEO', webm: 'VIDEO', avi: 'VIDEO',
  mp3: 'AUDIO', wav: 'AUDIO', flac: 'AUDIO', m4a: 'AUDIO', aac: 'AUDIO', ogg: 'AUDIO',
  zip: 'ARCHIVE', rar: 'ARCHIVE', '7z': 'ARCHIVE', tar: 'ARCHIVE', gz: 'ARCHIVE',
  ts: 'CODE', tsx: 'CODE', js: 'CODE', jsx: 'CODE', py: 'CODE', rs: 'CODE', go: 'CODE', java: 'CODE',
  glb: 'THREE_D', gltf: 'THREE_D', obj: 'THREE_D', fbx: 'THREE_D', stl: 'THREE_D',
  psd: 'CREATIVE', ai: 'CREATIVE', svg: 'CREATIVE', blend: 'CREATIVE',
};

export function normalizeFileExtension(name: string): string | undefined {
  const leaf = name.trim().split(/[\\/]/).pop() ?? '';
  const dot = leaf.lastIndexOf('.');
  if (dot <= 0 || dot === leaf.length - 1) return undefined;
  return leaf.slice(dot + 1).toLowerCase();
}

export function classifyFileAsset(name: string, mimeType?: string): FileAssetKind {
  const mime = mimeType?.trim().toLowerCase();
  if (mime) {
    if (mime.startsWith('image/')) return 'IMAGE';
    if (mime.startsWith('video/')) return 'VIDEO';
    if (mime.startsWith('audio/')) return 'AUDIO';
    if (mime.startsWith('text/')) return 'TEXT';
    if (mime === 'application/pdf') return 'DOCUMENT';
  }
  const extension = normalizeFileExtension(name);
  return extension ? EXTENSION_KIND[extension] ?? 'UNKNOWN' : 'UNKNOWN';
}

export function isVisualFileAsset(kind: FileAssetKind): boolean {
  return kind === 'IMAGE' || kind === 'VIDEO' || kind === 'DOCUMENT' || kind === 'THREE_D' || kind === 'CREATIVE';
}

export function validateAnalysisConfidence(confidence: number | undefined): boolean {
  return confidence === undefined || (Number.isFinite(confidence) && confidence >= 0 && confidence <= 1);
}
