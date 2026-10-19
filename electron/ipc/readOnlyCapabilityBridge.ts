/**
 * PRV-10.06h — Narrow Electron-main capability bridge.
 * Read-only capabilities only. Mutations cannot be dispatched by this bridge.
 * This is NOT the renderer's full CapabilityProtocol; privileged operations
 * remain behind their existing approval, permission and checkpoint mechanisms.
 */
export type DesktopReadCapability = 'desktop.workspace.list' | 'desktop.workspace.read-text' | 'desktop.recovery.inspect';
export interface DesktopReadCapabilityRequest {
  schemaVersion: 1;
  capabilityId: DesktopReadCapability;
  workspaceId: string;
  permissionLevel: 'L0_OBSERVE';
  relativePath?: string;
}
export interface DesktopReadCapabilityDeps {
  authorized(workspaceId: string): boolean;
  stopped(): boolean;
  list(workspaceId: string, relativePath: string): Promise<unknown>;
  readText(workspaceId: string, relativePath: string): Promise<unknown>;
  inspectRecovery(workspaceId: string): unknown;
}
export type DesktopReadCapabilityResult = { success: true; capabilityId: DesktopReadCapability; output: unknown }
  | { success: false; error: string };

const ALLOWED = new Set<DesktopReadCapability>(['desktop.workspace.list', 'desktop.workspace.read-text', 'desktop.recovery.inspect']);
const WS_ID = /^ws_[A-Za-z0-9-]{1,125}$/;
const safeObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export class DesktopReadOnlyCapabilityBridge {
  constructor(private readonly deps: DesktopReadCapabilityDeps) {}

  async invoke(raw: unknown): Promise<DesktopReadCapabilityResult> {
    if (!safeObject(raw)) return { success: false, error: 'CAPABILITY_REQUEST_INVALID' };
    const keys = Object.keys(raw);
    if (keys.some(key => !['schemaVersion', 'capabilityId', 'workspaceId', 'permissionLevel', 'relativePath'].includes(key))) {
      return { success: false, error: 'CAPABILITY_REQUEST_INVALID' };
    }
    if (raw.schemaVersion !== 1 || raw.permissionLevel !== 'L0_OBSERVE' ||
        typeof raw.capabilityId !== 'string' || !ALLOWED.has(raw.capabilityId as DesktopReadCapability) ||
        typeof raw.workspaceId !== 'string' || !WS_ID.test(raw.workspaceId)) {
      return { success: false, error: 'CAPABILITY_REQUEST_DENIED' };
    }
    const id = raw.capabilityId as DesktopReadCapability;
    const needsPath = id !== 'desktop.recovery.inspect';
    if (needsPath
      ? typeof raw.relativePath !== 'string' || raw.relativePath.length > 4096 || raw.relativePath.includes('\0')
      : raw.relativePath !== undefined) return { success: false, error: 'CAPABILITY_REQUEST_INVALID' };
    if (this.deps.stopped()) return { success: false, error: 'CAPABILITY_STOPPED' };
    if (!this.deps.authorized(raw.workspaceId)) return { success: false, error: 'CAPABILITY_WORKSPACE_UNAUTHORIZED' };
    try {
      const output = id === 'desktop.workspace.list'
        ? await this.deps.list(raw.workspaceId, raw.relativePath as string)
        : id === 'desktop.workspace.read-text'
          ? await this.deps.readText(raw.workspaceId, raw.relativePath as string)
          : this.deps.inspectRecovery(raw.workspaceId);
      // Do not report a successful result after STOP or workspace revocation during async I/O.
      if (this.deps.stopped()) return { success: false, error: 'CAPABILITY_STOPPED' };
      if (!this.deps.authorized(raw.workspaceId)) return { success: false, error: 'CAPABILITY_WORKSPACE_UNAUTHORIZED' };
      return { success: true, capabilityId: id, output };
    } catch {
      return { success: false, error: 'CAPABILITY_EXECUTION_FAILED' };
    }
  }
}
