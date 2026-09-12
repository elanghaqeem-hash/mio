import { contextBridge, ipcRenderer } from 'electron';

// Keep the sandboxed preload self-contained. Sandboxed preload scripts should not
// depend on arbitrary local CommonJS modules at runtime.
const IPC_CHANNELS = {
  WINDOW_MINIMIZE: 'mio:window:minimize',
  WINDOW_MAXIMIZE: 'mio:window:maximize',
  WINDOW_CLOSE: 'mio:window:close',
  WINDOW_IS_MAXIMIZED: 'mio:window:isMaximized',
  GET_SYSTEM_INFO: 'mio:system:getInfo',
  GET_APP_VERSION: 'mio:system:getVersion',
  SHOW_NOTIFICATION: 'mio:notification:show',
  EMERGENCY_STOP: 'mio:emergency:stop',
  QUIT_APP: 'mio:app:quit',
  FS_SELECT_DIRECTORY: 'mio:fs:selectDirectory',
  FS_GET_WORKSPACE: 'mio:fs:getWorkspace',
  FS_READ_FILE: 'mio:fs:readFile',
  FS_WRITE_FILE: 'mio:fs:writeFile',
  FS_LIST_DIRECTORY: 'mio:fs:listDirectory',
  FS_MOVE_FILE: 'mio:fs:moveFile',
} as const;

export interface MioDesktopAPI {
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  getSystemInfo: () => Promise<{ platform: string; arch: string; osVersion: string; totalMemMb: number; freeMemMb: number; cpuCores: number }>;
  getAppVersion: () => Promise<string>;
  showNotification: (options: { title: string; body: string; silent?: boolean }) => Promise<void>;
  triggerEmergencyStop: (reason: string) => Promise<void>;
  quitApp: () => Promise<void>;
  selectDirectory: () => Promise<string | null>;
  getWorkspace: () => Promise<string | null>;
  readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  listDirectory: (dirPath: string) => Promise<{ success: boolean; files?: Array<{ name: string; type: 'file' | 'directory' }>; error?: string }>;
  moveFile: (sourcePath: string, destinationPath: string) => Promise<{ success: boolean; error?: string }>;
  onEmergencyStopTriggered: (callback: (reason: string) => void) => () => void;
  onNavigate: (callback: (mode: string) => void) => () => void;
}

const desktopAPI: MioDesktopAPI = Object.freeze({
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  getSystemInfo: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SYSTEM_INFO),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
  showNotification: (options) => ipcRenderer.invoke(IPC_CHANNELS.SHOW_NOTIFICATION, options),
  triggerEmergencyStop: (reason) => ipcRenderer.invoke(IPC_CHANNELS.EMERGENCY_STOP, reason),
  quitApp: () => ipcRenderer.invoke(IPC_CHANNELS.QUIT_APP),
  selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.FS_SELECT_DIRECTORY),
  getWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.FS_GET_WORKSPACE),
  readFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FILE, filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE_FILE, filePath, content),
  listDirectory: (dirPath) => ipcRenderer.invoke(IPC_CHANNELS.FS_LIST_DIRECTORY, dirPath),
  moveFile: (sourcePath, destinationPath) => ipcRenderer.invoke(IPC_CHANNELS.FS_MOVE_FILE, sourcePath, destinationPath),
  onEmergencyStopTriggered: (callback) => {
    const handler = (_event: unknown, reason: string) => callback(reason);
    ipcRenderer.on('mio:event:emergencyStop', handler);
    return () => ipcRenderer.removeListener('mio:event:emergencyStop', handler);
  },
  onNavigate: (callback) => {
    const handler = (_event: unknown, mode: string) => callback(mode);
    ipcRenderer.on('mio:navigate', handler);
    return () => ipcRenderer.removeListener('mio:navigate', handler);
  },
});

contextBridge.exposeInMainWorld('mioDesktop', desktopAPI);
