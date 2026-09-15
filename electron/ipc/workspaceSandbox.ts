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

const MAX_RELATIVE_PATH_LENGTH = 4096;
const DEFAULT_MAX_TEXT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_DIRECTORY_ENTRIES = 1000;

interface AuthorizedWorkspaceRecord extends AuthorizedWorkspaceDescriptor {
  rootPath: string;
}

export class WorkspaceSandbox {
  private readonly workspaces = new Map<string, AuthorizedWorkspaceRecord>();

  constructor(
    private readonly maxTextBytes: number = DEFAULT_MAX_TEXT_BYTES,
    private readonly maxDirectoryEntries: number = DEFAULT_MAX_DIRECTORY_ENTRIES,
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
