import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface AuthorizedWorkspaceDescriptor {
  id: string;
  name: string;
}

export interface WorkspaceDirectoryEntry {
  name: string;
  type: 'FILE' | 'DIRECTORY' | 'SYMLINK' | 'OTHER';
}

export interface WorkspaceTreeHashFile {
  relativePath: string;
  bytes: number;
  sha256: string;
}

export interface WorkspaceTreeHashResult {
  schemaVersion: 1;
  algorithm: 'SHA-256';
  canonicalization: 'mio-adapter-tree-v1';
  rootRelativePath: string;
  fingerprint: string;
  fileCount: number;
  totalBytes: number;
  files: WorkspaceTreeHashFile[];
  limits: {
    maxFiles: number;
    maxBytes: number;
    maxDepth: number;
  };
}

const MAX_RELATIVE_PATH_LENGTH = 4096;
const DEFAULT_MAX_TEXT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_DIRECTORY_ENTRIES = 1000;
const DEFAULT_MAX_HASH_FILES = 5000;
const DEFAULT_MAX_HASH_BYTES = 4 * 1024 * 1024 * 1024;
const DEFAULT_MAX_HASH_DEPTH = 24;
const HASH_CHUNK_BYTES = 1024 * 1024;

interface AuthorizedWorkspaceRecord extends AuthorizedWorkspaceDescriptor {
  rootPath: string;
}

export class WorkspaceSandbox {
  private readonly workspaces = new Map<string, AuthorizedWorkspaceRecord>();

  constructor(
    private readonly maxTextBytes: number = DEFAULT_MAX_TEXT_BYTES,
    private readonly maxDirectoryEntries: number = DEFAULT_MAX_DIRECTORY_ENTRIES,
    private readonly maxHashFiles: number = DEFAULT_MAX_HASH_FILES,
    private readonly maxHashBytes: number = DEFAULT_MAX_HASH_BYTES,
    private readonly maxHashDepth: number = DEFAULT_MAX_HASH_DEPTH,
  ) {}

  public async authorizeRoot(selectedPath: string): Promise<AuthorizedWorkspaceDescriptor> {
    if (typeof selectedPath !== 'string' || selectedPath.trim().length === 0) throw new Error('Workspace path is required');
    const canonicalRoot = await fs.promises.realpath(selectedPath);
    const stat = await fs.promises.stat(canonicalRoot);
    if (!stat.isDirectory()) throw new Error('Selected workspace root is not a directory');

    const descriptor: AuthorizedWorkspaceRecord = {
      id: `ws_${crypto.randomUUID()}`,
      name: path.basename(canonicalRoot) || 'Workspace',
      rootPath: canonicalRoot,
    };
    this.workspaces.set(descriptor.id, descriptor);
    return { id: descriptor.id, name: descriptor.name };
  }

  public revoke(workspaceId: string): boolean {
    return this.workspaces.delete(workspaceId);
  }

  public revokeAll(): void {
    this.workspaces.clear();
  }

  public listAuthorized(): AuthorizedWorkspaceDescriptor[] {
    return [...this.workspaces.values()].map(({ id, name }) => ({ id, name }));
  }

  public async readText(workspaceId: string, relativePath: string): Promise<{ data: string; bytes: number }> {
    const targetPath = await this.resolveExisting(workspaceId, relativePath);
    const stat = await fs.promises.stat(targetPath);
    if (!stat.isFile()) throw new Error('Requested workspace path is not a file');
    if (stat.size > this.maxTextBytes) throw new Error(`File exceeds bounded text-read limit (${stat.size} > ${this.maxTextBytes} bytes)`);

    const data = await fs.promises.readFile(targetPath, 'utf-8');
    if (data.includes('\u0000')) throw new Error('Binary or null-delimited content is not accepted by text-read capability');
    return { data, bytes: stat.size };
  }

  public async listDirectory(workspaceId: string, relativePath: string = '.'): Promise<WorkspaceDirectoryEntry[]> {
    const targetPath = await this.resolveExisting(workspaceId, relativePath);
    const stat = await fs.promises.stat(targetPath);
    if (!stat.isDirectory()) throw new Error('Requested workspace path is not a directory');

    const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
    if (entries.length > this.maxDirectoryEntries) throw new Error(`Directory exceeds bounded listing limit (${entries.length} > ${this.maxDirectoryEntries} entries)`);

    return entries.map((entry) => ({
      name: entry.name,
      type: entry.isFile() ? 'FILE' : entry.isDirectory() ? 'DIRECTORY' : entry.isSymbolicLink() ? 'SYMLINK' : 'OTHER',
    }));
  }

  public async hashTree(workspaceId: string, relativePath: string = '.'): Promise<WorkspaceTreeHashResult> {
    const targetRoot = await this.resolveExisting(workspaceId, relativePath || '.');
    const rootStat = await fs.promises.stat(targetRoot);
    if (!rootStat.isDirectory()) throw new Error('Adapter integrity target must be a directory');

    const files: WorkspaceTreeHashFile[] = [];
    let totalBytes = 0;
    let visitedEntries = 0;
    const maxVisitedEntries = Math.max(this.maxHashFiles * 4, this.maxHashFiles + 1000);

    const walk = async (directory: string, depth: number): Promise<void> => {
      if (depth > this.maxHashDepth) throw new Error(`Adapter tree exceeds maximum traversal depth (${depth} > ${this.maxHashDepth})`);
      const entries = await fs.promises.readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));

      for (const entry of entries) {
        visitedEntries += 1;
        if (visitedEntries > maxVisitedEntries) throw new Error(`Adapter tree exceeds bounded entry scan limit (${maxVisitedEntries})`);
        const entryPath = path.join(directory, entry.name);
        const lstat = await fs.promises.lstat(entryPath);
        if (lstat.isSymbolicLink() || entry.isSymbolicLink()) {
          throw new Error(`Adapter integrity scan rejects symbolic links: ${this.relativeDisplayPath(targetRoot, entryPath)}`);
        }
        if (lstat.isDirectory()) {
          const canonicalDirectory = await fs.promises.realpath(entryPath);
          this.assertContained(targetRoot, canonicalDirectory, 'Adapter directory escapes authorized integrity root');
          await walk(canonicalDirectory, depth + 1);
          continue;
        }
        if (!lstat.isFile()) {
          throw new Error(`Adapter integrity scan rejects non-regular filesystem entries: ${this.relativeDisplayPath(targetRoot, entryPath)}`);
        }
        if (files.length >= this.maxHashFiles) throw new Error(`Adapter tree exceeds maximum file count (${this.maxHashFiles})`);

        const canonicalFile = await fs.promises.realpath(entryPath);
        this.assertContained(targetRoot, canonicalFile, 'Adapter file escapes authorized integrity root');
        const before = await fs.promises.stat(canonicalFile);
        if (!before.isFile()) throw new Error('Adapter integrity scan encountered a non-file after canonical resolution');
        if (totalBytes + before.size > this.maxHashBytes) {
          throw new Error(`Adapter tree exceeds maximum hashed byte budget (${totalBytes + before.size} > ${this.maxHashBytes})`);
        }

        const sha256 = await this.hashFile(canonicalFile);
        const after = await fs.promises.stat(canonicalFile);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
          throw new Error(`Adapter file changed while hashing: ${this.relativeDisplayPath(targetRoot, canonicalFile)}`);
        }
        totalBytes += after.size;
        files.push({
          relativePath: this.relativeDisplayPath(targetRoot, canonicalFile),
          bytes: after.size,
          sha256,
        });
      }
    };

    await walk(targetRoot, 0);
    if (files.length === 0) throw new Error('Adapter integrity directory contains no regular files');
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

    const treeHash = crypto.createHash('sha256');
    treeHash.update('mio-adapter-tree-v1\n', 'utf-8');
    for (const file of files) treeHash.update(`${JSON.stringify([file.relativePath, file.bytes, file.sha256])}\n`, 'utf-8');

    return {
      schemaVersion: 1,
      algorithm: 'SHA-256',
      canonicalization: 'mio-adapter-tree-v1',
      rootRelativePath: relativePath || '.',
      fingerprint: treeHash.digest('hex'),
      fileCount: files.length,
      totalBytes,
      files,
      limits: {
        maxFiles: this.maxHashFiles,
        maxBytes: this.maxHashBytes,
        maxDepth: this.maxHashDepth,
      },
    };
  }

  public async resolveExisting(workspaceId: string, relativePath: string): Promise<string> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('Unknown or revoked workspace authority');
    this.validateRelativePath(relativePath);

    const candidate = path.resolve(workspace.rootPath, relativePath || '.');
    this.assertContained(workspace.rootPath, candidate, 'Path escapes authorized workspace root');

    const canonicalTarget = await fs.promises.realpath(candidate);
    this.assertContained(workspace.rootPath, canonicalTarget, 'Resolved path escapes authorized workspace root');
    return canonicalTarget;
  }

  private async hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath, { highWaterMark: HASH_CHUNK_BYTES });
      stream.on('data', (chunk) => hash.update(chunk));
      stream.once('error', reject);
      stream.once('end', () => resolve(hash.digest('hex')));
    });
  }

  private relativeDisplayPath(rootPath: string, targetPath: string): string {
    const relative = path.relative(rootPath, targetPath);
    return (relative || '.').split(path.sep).join('/');
  }

  private validateRelativePath(relativePath: string): void {
    if (typeof relativePath !== 'string') throw new Error('Relative path must be a string');
    if (relativePath.length > MAX_RELATIVE_PATH_LENGTH) throw new Error('Relative path exceeds maximum supported length');
    if (relativePath.includes('\u0000')) throw new Error('Relative path contains invalid null characters');
    if (path.isAbsolute(relativePath)) throw new Error('Absolute paths are not accepted by workspace capabilities');
  }

  private assertContained(rootPath: string, targetPath: string, message: string): void {
    const relative = path.relative(rootPath, targetPath);
    const escapes = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
    if (escapes) throw new Error(message);
  }
}
