import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc/channels';

export interface MioWorkspaceDescriptor {
  id: string;
  name: string;
}

export interface MioWorkspaceDirectoryEntry {
  name: string;
  type: 'FILE' | 'DIRECTORY' | 'SYMLINK' | 'OTHER';
}

export interface MioWorkspaceTreeHashResult {
  schemaVersion: 1;
  algorithm: 'SHA-256';
  canonicalization: 'mio-adapter-tree-v1';
  rootRelativePath: string;
  fingerprint: string;
  fileCount: number;
  totalBytes: number;
  limits: { maxFiles: number; maxBytes: number; maxDepth: number };
}

export interface MioBrowserReadResult {
  success: boolean;
  title?: string;
  url?: string;
  text?: string;
  truncated?: boolean;
  error?: string;
}

export interface MioDesktopAPI {
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;

  getSystemInfo: () => Promise<{
    platform: string;
    arch: string;
    osVersion: string;
    totalMemMb: number;
    freeMemMb: number;
    cpuCores: number;
  }>;
  getAppVersion: () => Promise<string>;

  showNotification: (options: { title: string; body: string; silent?: boolean }) => Promise<{ success: boolean; error?: string }>;
  triggerEmergencyStop: (reason: string) => Promise<{ success: boolean }>;
  quitApp: () => Promise<void>;

  authorizeWorkspace: () => Promise<{ success: boolean; cancelled?: boolean; workspace?: MioWorkspaceDescriptor; error?: string }>;
  revokeWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
  readWorkspaceText: (request: { workspaceId: string; relativePath: string }) => Promise<{ success: boolean; data?: string; bytes?: number; error?: string }>;
  listWorkspace: (request: { workspaceId: string; relativePath: string }) => Promise<{ success: boolean; entries?: MioWorkspaceDirectoryEntry[]; error?: string }>;
  hashWorkspaceTree: (request: { workspaceId: string; relativePath: string }) => Promise<{ success: boolean; result?: MioWorkspaceTreeHashResult; error?: string }>;
  browserReadPage: (request: { url: string }) => Promise<MioBrowserReadResult>;

  onEmergencyStopTriggered: (callback: (reason: string) => void) => () => void;
}

const desktopAPI: MioDesktopAPI = {
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),

  getSystemInfo: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SYSTEM_INFO),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),

  showNotification: (options) => ipcRenderer.invoke(IPC_CHANNELS.SHOW_NOTIFICATION, options),
  triggerEmergencyStop: (reason) => ipcRenderer.invoke(IPC_CHANNELS.EMERGENCY_STOP, reason),
  quitApp: () => ipcRenderer.invoke(IPC_CHANNELS.QUIT_APP),

  authorizeWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.FS_AUTHORIZE_WORKSPACE),
  revokeWorkspace: (workspaceId) => ipcRenderer.invoke(IPC_CHANNELS.FS_REVOKE_WORKSPACE, workspaceId),
  readWorkspaceText: (request) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ_WORKSPACE_TEXT, request),
  listWorkspace: (request) => ipcRenderer.invoke(IPC_CHANNELS.FS_LIST_WORKSPACE, request),
  hashWorkspaceTree: (request) => ipcRenderer.invoke(IPC_CHANNELS.FS_HASH_WORKSPACE_TREE, request),
  browserReadPage: (request) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_READ_PAGE, request),

  onEmergencyStopTriggered: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, reason: string) => callback(reason);
    ipcRenderer.on('mio:event:emergencyStop', handler);
    return () => ipcRenderer.removeListener('mio:event:emergencyStop', handler);
  },
};

contextBridge.exposeInMainWorld('mioDesktop', desktopAPI);
