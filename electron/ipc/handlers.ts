import { app, BrowserWindow, dialog, IpcMainInvokeEvent, Notification } from 'electron';
import * as os from 'os';
import { BrowserReadSandbox } from './browserReadSandbox';
import { WorkspaceSandbox } from './workspaceSandbox';

export interface WorkspacePathRequest {
  workspaceId: string;
  relativePath: string;
}

export interface BrowserReadPageRequest {
  url: string;
}

const MAX_NOTIFICATION_TEXT = 2000;
const MAX_STOP_REASON = 500;
const MAX_WORKSPACE_ID = 128;
const MAX_BROWSER_URL = 2048;

export function setupIpcHandlers(mainWindow: BrowserWindow) {
  const workspaceSandbox = new WorkspaceSandbox();
  const browserReadSandbox = new BrowserReadSandbox();

  const validateWorkspaceId = (workspaceId: unknown): workspaceId is string => {
    return typeof workspaceId === 'string' && workspaceId.length > 0 && workspaceId.length <= MAX_WORKSPACE_ID && /^ws_[a-zA-Z0-9-]+$/.test(workspaceId);
  };

  const validateWorkspacePathRequest = (request: unknown): request is WorkspacePathRequest => {
    if (!request || typeof request !== 'object') return false;
    const value = request as Partial<WorkspacePathRequest>;
    return validateWorkspaceId(value.workspaceId) && typeof value.relativePath === 'string' && value.relativePath.length <= 4096;
  };

  const validateBrowserReadRequest = (request: unknown): request is BrowserReadPageRequest => {
    if (!request || typeof request !== 'object') return false;
    const value = request as Partial<BrowserReadPageRequest>;
    return typeof value.url === 'string' && value.url.trim().length > 0 && value.url.length <= MAX_BROWSER_URL;
  };

  return {
    // Window Management
    handleMinimize: () => {
      if (mainWindow) mainWindow.minimize();
    },
    handleMaximize: () => {
      if (!mainWindow) return false;
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        return false;
      }
      mainWindow.maximize();
      return true;
    },
    handleClose: () => {
      if (mainWindow) mainWindow.close();
    },
    handleIsMaximized: () => mainWindow ? mainWindow.isMaximized() : false,

    // System Telemetry
    handleGetSystemInfo: () => ({
      platform: process.platform,
      arch: process.arch,
      osVersion: os.release(),
      totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
      freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
      cpuCores: os.cpus().length,
    }),
    handleGetAppVersion: () => app.getVersion(),

    // Desktop Notifications
    handleShowNotification: (_event: IpcMainInvokeEvent, options: unknown) => {
      if (!options || typeof options !== 'object') return { success: false, error: 'Invalid notification payload' };
      const value = options as { title?: unknown; body?: unknown; silent?: unknown };
      if (typeof value.title !== 'string' || typeof value.body !== 'string') return { success: false, error: 'Notification title/body must be strings' };
      if (value.title.length > MAX_NOTIFICATION_TEXT || value.body.length > MAX_NOTIFICATION_TEXT) return { success: false, error: 'Notification payload exceeds bounded length' };
      if (Notification.isSupported()) {
        new Notification({ title: value.title || 'Mio V2 Notification', body: value.body, silent: value.silent === true }).show();
      }
      return { success: true };
    },

    // Emergency Stop
    handleEmergencyStop: (_event: IpcMainInvokeEvent, reason: unknown) => {
      const safeReason = typeof reason === 'string' ? reason.slice(0, MAX_STOP_REASON) : 'Renderer requested STOP MIO';
      console.warn(`[ELECTRON MAIN] Emergency Stop Triggered: ${safeReason}`);
      if (mainWindow) mainWindow.webContents.send('mio:event:emergencyStop', safeReason);
      return { success: true };
    },

    // Workspace authority is created only by an explicit native directory picker.
    handleAuthorizeWorkspace: async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Authorize Workspace Directory for Mio',
      });
      if (result.canceled || result.filePaths.length === 0) return { success: false, cancelled: true };
      try {
        const workspace = await workspaceSandbox.authorizeRoot(result.filePaths[0]);
        return { success: true, workspace };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    handleRevokeWorkspace: (_event: IpcMainInvokeEvent, workspaceId: unknown) => {
      if (!validateWorkspaceId(workspaceId)) return { success: false, error: 'Invalid workspace authority id' };
      return { success: workspaceSandbox.revoke(workspaceId) };
    },

    handleReadWorkspaceText: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateWorkspacePathRequest(request)) return { success: false, error: 'Invalid workspace text-read request' };
      try {
        const result = await workspaceSandbox.readText(request.workspaceId, request.relativePath);
        return { success: true, data: result.data, bytes: result.bytes };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    handleListWorkspace: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateWorkspacePathRequest(request)) return { success: false, error: 'Invalid workspace directory-list request' };
      try {
        const entries = await workspaceSandbox.listDirectory(request.workspaceId, request.relativePath);
        return { success: true, entries };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    handleHashWorkspaceTree: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateWorkspacePathRequest(request)) return { success: false, error: 'Invalid workspace tree-hash request' };
      try {
        const result = await workspaceSandbox.hashTree(request.workspaceId, request.relativePath);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    // Browser bridge is intentionally read-only in TP-0.41.
    handleBrowserReadPage: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateBrowserReadRequest(request)) return { success: false, error: 'Invalid browser read request' };
      try {
        const result = await browserReadSandbox.read(request);
        return { success: true, ...result };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    revokeAllWorkspaceAuthority: () => workspaceSandbox.revokeAll(),
  };
}
