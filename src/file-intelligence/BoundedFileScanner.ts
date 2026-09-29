import {
  classifyFileAsset,
  normalizeFileExtension,
  type FileAsset,
  type FileScanRequest,
  type FileScanResult,
} from './contracts';
import { inspectFileSignature } from './FileSignatureInspector';

export interface ReadOnlyScanEntry {
  name: string;
  type: 'FILE' | 'DIRECTORY' | 'SYMLINK' | 'OTHER';
  bytes?: number;
  modifiedAtMs?: number;
  createdAtMs?: number;
}

export interface ReadOnlyFileScanSource {
  listDirectory(workspaceId: string, relativePath: string): Promise<ReadOnlyScanEntry[]>;
  readFileHeader?(workspaceId: string, relativePath: string, maxBytes: number): Promise<{ bytes: number[]; fileBytes: number }>;
  hashFile?(workspaceId: string, relativePath: string): Promise<{ sha256: string; bytes: number; modifiedAtMs?: number }>;
}

const DEFAULT_MAX_FILES = 5000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_SCAN_DEPTH = 24;
const DEFAULT_EXCLUDED_NAMES = new Set(['node_modules', '.git', '.svn', '.hg', '$RECYCLE.BIN', 'System Volume Information']);

const isHiddenName = (name: string): boolean => name.startsWith('.') && name !== '.' && name !== '..';

const joinRelative = (parent: string, child: string): string => parent === '.' ? child : `${parent}/${child}`;

export class BoundedFileScanner {
  constructor(private readonly source: ReadOnlyFileScanSource) {}

  public async scan(request: FileScanRequest, signal?: AbortSignal): Promise<FileScanResult> {
    const startedAtMs = Date.now();
    const maxFiles = this.boundedLimit(request.maxFiles, DEFAULT_MAX_FILES, 'maxFiles');
    const maxBytes = this.boundedLimit(request.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes');
    const maxDepth = this.boundedLimit(request.maxDepth, MAX_SCAN_DEPTH, 'maxDepth');
    const excludedNames = new Set([...DEFAULT_EXCLUDED_NAMES, ...(request.excludeNames ?? [])]);
    const excludedExtensions = new Set((request.excludeExtensions ?? []).map((value) => value.replace(/^\./, '').toLowerCase()).filter(Boolean));
    const files: FileAsset[] = [];
    let totalBytes = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const visit = async (relativePath: string, depth: number): Promise<void> => {
      this.assertActive(signal);
      if (depth > maxDepth) throw new Error(`File scan exceeds maximum traversal depth (${maxDepth})`);

      const entries = await this.source.listDirectory(request.workspaceId, relativePath);
      const ordered = [...entries].sort((left, right) => left.name.localeCompare(right.name));

      for (const entry of ordered) {
        this.assertActive(signal);
        const childPath = joinRelative(relativePath, entry.name);
        if (excludedNames.has(entry.name) || (!request.includeHidden && isHiddenName(entry.name))) {
          skippedCount += 1;
          continue;
        }
        if (entry.type === 'DIRECTORY') {
          if (request.recursive) await visit(childPath, depth + 1);
          continue;
        }
        if (entry.type !== 'FILE') {
          skippedCount += 1;
          continue;
        }
        const extension = normalizeFileExtension(entry.name);
        if (extension && excludedExtensions.has(extension)) {
          skippedCount += 1;
          continue;
        }
        if (files.length >= maxFiles) throw new Error(`File scan exceeds bounded file limit (${maxFiles})`);

        const bytes = Number.isFinite(entry.bytes) && (entry.bytes ?? -1) >= 0 ? entry.bytes! : 0;
        if (totalBytes + bytes > maxBytes) throw new Error(`File scan exceeds bounded byte budget (${maxBytes})`);
        totalBytes += bytes;

        let signatureMetadata: FileAsset['metadata'] extends infer M ? Partial<M> : never = {};
        let detectedMime: string | undefined;
        if (request.inspectSignatures && this.source.readFileHeader) {
          const header = await this.source.readFileHeader(request.workspaceId, childPath, 512);
          const inspection = inspectFileSignature(entry.name, new Uint8Array(header.bytes));
          detectedMime = inspection.mimeType;
          signatureMetadata = {
            signature: inspection.signature,
            signatureSource: inspection.source,
            extensionConsistent: inspection.extensionConsistent,
            supportedFormat: inspection.supported,
            corruptReason: inspection.corruptReason,
          };
        }
        let hashMetadata: FileAsset['metadata'] extends infer M ? Partial<M> : never = {};
        if (request.hashFiles && this.source.hashFile) {
          const hashed = await this.source.hashFile(request.workspaceId, childPath);
          if (hashed.bytes !== bytes || (entry.modifiedAtMs !== undefined && hashed.modifiedAtMs !== undefined && entry.modifiedAtMs !== hashed.modifiedAtMs)) {
            throw new Error(`File changed during scan: ${childPath}`);
          }
          hashMetadata = { sha256: hashed.sha256 };
        }

        files.push({
          schemaVersion: 1,
          identity: {
            workspaceId: request.workspaceId,
            relativePath: childPath,
            name: entry.name,
            extension,
            mimeType: detectedMime,
            kind: classifyFileAsset(entry.name, detectedMime),
          },
          metadata: {
            bytes,
            modifiedAtMs: entry.modifiedAtMs,
            createdAtMs: entry.createdAtMs,
            ...signatureMetadata,
            ...hashMetadata,
          },
          state: 'METADATA_READY',
        });
      }
    };

    try {
      await visit(request.relativePath || '.', 0);
    } catch (error) {
      if (this.isAbort(error)) throw error;
      failedCount += 1;
      throw error;
    }

    return {
      schemaVersion: 1,
      workspaceId: request.workspaceId,
      rootRelativePath: request.relativePath || '.',
      depth: request.depth,
      startedAtMs,
      finishedAtMs: Date.now(),
      files,
      skippedCount,
      failedCount,
    };
  }

  private boundedLimit(value: number | undefined, fallback: number, label: string): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value <= 0 || value > fallback) {
      throw new Error(`${label} must be a positive integer no greater than ${fallback}`);
    }
    return value;
  }

  private assertActive(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException('File scan cancelled', 'AbortError');
  }

  private isAbort(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }
}
