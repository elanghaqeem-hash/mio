import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc/channels';

export interface MioDesktopAPI {
  // Window Management
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;

  // System & Environment Telemetry
  getSystemInfo: () => Promise<{
    platform: string;
    arch: string;
    osVersion: string;
    totalMemMb: number;
    freeMemMb: number;
    cpuCores: number;
  }>;
  getAppVersion: () => Promise<string>;

  // Notifications
  showNotification: (options: { title: string; body: string; silent?: boolean }) => Promise<void>;

  // Emergency Stop & Application Lifecycle
  triggerEmergencyStop: (reason: string) => Promise<void>;
  quitApp: () => Promise<void>;

  // Controlled File Sandbox (Scoped)
  selectDirectory: () => Promise<string | null>;
  readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  listDirectory: (dirPath: string) => Promise<{ success: boolean; files?: string[]; error?: string }>;

  // Event Listeners from Main Process (e.g. Tray actions, Stop shortcuts)
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

  selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.FS_SELECT_DIRECTORY),
  readFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FILE, filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE_FILE, filePath, content),
  listDirectory: (dirPath) => ipcRenderer.invoke(IPC_CHANNELS.FS_LIST_DIRECTORY, dirPath),

  onEmergencyStopTriggered: (callback) => {
    const handler = (_: any, reason: string) => callback(reason);
    ipcRenderer.on('mio:event:emergencyStop', handler);
    return () => {
      ipcRenderer.removeListener('mio:event:emergencyStop', handler);
    };
  },
};

contextBridge.exposeInMainWorld('mioDesktop', desktopAPI);
