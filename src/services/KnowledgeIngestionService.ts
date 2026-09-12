import { ProjectManager } from '../project/ProjectManager';
import { MioMemoryManager, type MemoryWriteResult } from '../security/MemoryManager';
import { PolicyEngine } from '../security/PolicyEngine';

const SUPPORTED_TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.log', '.xml', '.yaml', '.yml',
  '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.htm', '.py', '.java', '.sql', '.ini', '.toml',
]);

export interface DocumentIngestionInput {
  workspaceId: string;
  relativePath: string;
  content: string;
  bytes: number;
}

export interface DocumentIngestionResult {
  assetId: string;
  suspicious: boolean;
  detectedThreats: string[];
  memory: MemoryWriteResult;
  sanitizedContent: string;
}

export class KnowledgeIngestionService {
  public static isSupportedTextPath(relativePath: string): boolean {
    const normalized = relativePath.trim().toLowerCase();
    const dot = normalized.lastIndexOf('.');
    return dot >= 0 && SUPPORTED_TEXT_EXTENSIONS.has(normalized.slice(dot));
  }

  public static ingestDocument(input: DocumentIngestionInput): DocumentIngestionResult {
    if (!input.workspaceId.trim()) throw new Error('Workspace authority is required for document ingestion');
    if (!input.relativePath.trim()) throw new Error('Document relative path is required');
    if (!this.isSupportedTextPath(input.relativePath)) throw new Error('File type is not supported by the read-only text ingestion pipeline');
    if (!Number.isFinite(input.bytes) || input.bytes < 0) throw new Error('Document byte size is invalid');
    if (!input.content.trim()) throw new Error('Empty documents are not ingested into project context');

    const source = `document:desktop-workspace:${input.workspaceId}:${input.relativePath}`;
    const scan = PolicyEngine.sanitizeExternalContent(input.content, source);
    const name = input.relativePath.split(/[\\/]/).filter(Boolean).pop() ?? 'Imported document';

    const asset = ProjectManager.addAsset({
      name,
      type: 'document',
      origin: 'IMPORTED',
      sizeBytes: input.bytes,
      filePath: `workspace://${input.workspaceId}/${input.relativePath}`,
      data: {
        content: scan.sanitized,
        originalSource: source,
        quarantine: true,
        suspicious: scan.suspicious,
        detectedThreats: [...scan.detectedThreats],
      },
      verified: false,
      notes: 'Imported as untrusted read-only project context. Long-term memory promotion requires explicit review.',
    });

    const memory = MioMemoryManager.proposeMemory({
      category: 'PROJECT_CONTEXT',
      content: scan.sanitized,
      confidence: scan.suspicious ? 0.35 : 0.6,
      source,
      permissionLevel: 'L1_SUGGEST',
    });

    return {
      assetId: asset.id,
      suspicious: scan.suspicious,
      detectedThreats: [...scan.detectedThreats],
      memory,
      sanitizedContent: scan.sanitized,
    };
  }
}
