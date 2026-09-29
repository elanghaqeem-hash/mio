import {
  classifyFileAsset,
  normalizeFileExtension,
  type FileAsset,
  type FileScanRequest,
  type FileScanResult,
} from './contracts';

export interface ReadOnlyScanEntry {
  name: string;
  type: 'FILE' | 'DIRECTORY' | 'SYMLINK' | 'OTHER';
  bytes?: number;
  modifiedAtMs?: number;
  createdAtMs?: number;
}

export interface ReadOnlyFileScanSource {
  listDirectory(workspaceId: string, relativePath: string): Promise<ReadOnlyScanEntry[]>;
}

const DEFAULT_MAX_FILES = 5000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_SCAN_DEPTH = 24;

const joinRelative = (parent: string, child: string): string => parent === '.' ? child : `${parent}/${child}`;

export class BoundedFileScanner {
  constructor(private readonly source: ReadOnlyFileScanSource) {}

  public async scan(request: FileScanRequest, signal?: AbortSignal): Promise<FileScanResult> {
    const startedAtMs = Date.now();
    const maxFiles = this.boundedLimit(request.maxFiles, DEFAULT_MAX_FILES, 'maxFiles');
    const maxBytes = this.boundedLimit(request.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes');
    const files: FileAsset[] = [];
    let totalBytes = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const visit = async (relativePath: string, depth: number): Promise<void> => {
      this.assertActive(signal);
      if (depth > MAX_SCAN_DEPTH) throw new Error(`File scan exceeds maximum traversal depth (${MAX_SCAN_DEPTH})`);

      const entries = await this.source.listDirectory(request.workspaceId, relativePath);
      const ordered = [...entries].sort((left, right) => left.name.localeCompare(right.name));

      for (const entry of ordered) {
        this.assertActive(signal);
        const childPath = joinRelative(relativePath, entry.name);
        if (entry.type === 'DIRECTORY') {
          if (request.recursive) await visit(childPath, depth + 1);
          continue;
        }
        if (entry.type !== 'FILE') {
          skippedCount += 1;
          continue;
        }
        if (files.length >= maxFiles) throw new Error(`File scan exceeds bounded file limit (${maxFiles})`);

        const bytes = Number.isFinite(entry.bytes) && (entry.bytes ?? -1) >= 0 ? entry.bytes! : 0;
        if (totalBytes + bytes > maxBytes) throw new Error(`File scan exceeds bounded byte budget (${maxBytes})`);
        totalBytes += bytes;

        files.push({
          schemaVersion: 1,
          identity: {
            workspaceId: request.workspaceId,
            relativePath: childPath,
            name: entry.name,
            extension: normalizeFileExtension(entry.name),
            kind: classifyFileAsset(entry.name),
          },
          metadata: {
            bytes,
            modifiedAtMs: entry.modifiedAtMs,
            createdAtMs: entry.createdAtMs,
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
