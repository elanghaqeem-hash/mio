import { contextBridge, ipcRenderer } from 'electron';

const C = {
  WINDOW_MINIMIZE: 'mio:window:minimize', WINDOW_MAXIMIZE: 'mio:window:maximize', WINDOW_CLOSE: 'mio:window:close', WINDOW_IS_MAXIMIZED: 'mio:window:isMaximized',
  GET_SYSTEM_INFO: 'mio:system:getInfo', GET_APP_VERSION: 'mio:system:getVersion', GET_SECURITY_STATUS: 'mio:security:getStatus', SHOW_NOTIFICATION: 'mio:notification:show',
  EMERGENCY_STOP: 'mio:emergency:stop', QUIT_APP: 'mio:app:quit',
  FS_SELECT_DIRECTORY: 'mio:fs:selectDirectory', FS_GET_WORKSPACE: 'mio:fs:getWorkspace', FS_READ_FILE: 'mio:fs:readFile', FS_WRITE_FILE: 'mio:fs:writeFile', FS_LIST_DIRECTORY: 'mio:fs:listDirectory', FS_MOVE_FILE: 'mio:fs:moveFile',
  DB_STATUS: 'mio:db:status', SETTINGS_GET: 'mio:settings:get', SETTINGS_SET: 'mio:settings:set', PROJECT_LOAD: 'mio:project:load', PROJECT_SAVE: 'mio:project:save', AUDIT_LIST: 'mio:audit:list',
  PROVIDER_LIST: 'mio:provider:list', PROVIDER_SAVE: 'mio:provider:save', PROVIDER_REMOVE: 'mio:provider:remove', PROVIDER_TEST: 'mio:provider:test', PROVIDER_GENERATE: 'mio:provider:generate',
} as const;

export interface MioDesktopAPI {
  minimizeWindow(): Promise<void>; maximizeWindow(): Promise<boolean>; closeWindow(): Promise<void>; isMaximized(): Promise<boolean>;
  getSystemInfo(): Promise<Record<string, unknown>>; getAppVersion(): Promise<string>; getSecurityStatus(): Promise<Record<string, unknown>>;
  showNotification(options: { title: string; body: string; silent?: boolean }): Promise<void>; triggerEmergencyStop(reason: string): Promise<void>; quitApp(): Promise<void>;
  selectDirectory(): Promise<string | null>; getWorkspace(): Promise<string | null>;
  readFile(path: string): Promise<any>; writeFile(path: string, content: string): Promise<any>; listDirectory(path: string): Promise<any>; moveFile(source: string, destination: string): Promise<any>;
  getDatabaseStatus(): Promise<any>; getSetting(key: string, fallback?: unknown): Promise<any>; setSetting(key: string, value: unknown): Promise<void>;
  loadProject(id: string): Promise<any>; saveProject(project: unknown): Promise<void>; listAudit(limit?: number): Promise<any[]>;
  listProviders(): Promise<any[]>; saveProvider(input: unknown): Promise<any>; removeProvider(provider: string): Promise<void>; testProvider(provider: string): Promise<any>; generateWithProvider(provider: string, prompt: string): Promise<any>;
  onEmergencyStopTriggered(callback: (reason: string) => void): () => void; onNavigate(callback: (mode: string) => void): () => void;
}

const api: MioDesktopAPI = {
  minimizeWindow: () => ipcRenderer.invoke(C.WINDOW_MINIMIZE), maximizeWindow: () => ipcRenderer.invoke(C.WINDOW_MAXIMIZE), closeWindow: () => ipcRenderer.invoke(C.WINDOW_CLOSE), isMaximized: () => ipcRenderer.invoke(C.WINDOW_IS_MAXIMIZED),
  getSystemInfo: () => ipcRenderer.invoke(C.GET_SYSTEM_INFO), getAppVersion: () => ipcRenderer.invoke(C.GET_APP_VERSION), getSecurityStatus: () => ipcRenderer.invoke(C.GET_SECURITY_STATUS),
  showNotification: (o: { title: string; body: string; silent?: boolean }) => ipcRenderer.invoke(C.SHOW_NOTIFICATION, o), triggerEmergencyStop: (r: string) => ipcRenderer.invoke(C.EMERGENCY_STOP, r), quitApp: () => ipcRenderer.invoke(C.QUIT_APP),
  selectDirectory: () => ipcRenderer.invoke(C.FS_SELECT_DIRECTORY), getWorkspace: () => ipcRenderer.invoke(C.FS_GET_WORKSPACE), readFile: (p: string) => ipcRenderer.invoke(C.FS_READ_FILE, p), writeFile: (p: string, x: string) => ipcRenderer.invoke(C.FS_WRITE_FILE, p, x), listDirectory: (p: string) => ipcRenderer.invoke(C.FS_LIST_DIRECTORY, p), moveFile: (a: string, b: string) => ipcRenderer.invoke(C.FS_MOVE_FILE, a, b),
  getDatabaseStatus: () => ipcRenderer.invoke(C.DB_STATUS), getSetting: (k: string, f?: unknown) => ipcRenderer.invoke(C.SETTINGS_GET, k, f), setSetting: (k: string, v: unknown) => ipcRenderer.invoke(C.SETTINGS_SET, k, v), loadProject: (id: string) => ipcRenderer.invoke(C.PROJECT_LOAD, id), saveProject: (p: unknown) => ipcRenderer.invoke(C.PROJECT_SAVE, p), listAudit: (l?: number) => ipcRenderer.invoke(C.AUDIT_LIST, l),
  listProviders: () => ipcRenderer.invoke(C.PROVIDER_LIST), saveProvider: (x: unknown) => ipcRenderer.invoke(C.PROVIDER_SAVE, x), removeProvider: (p: string) => ipcRenderer.invoke(C.PROVIDER_REMOVE, p), testProvider: (p: string) => ipcRenderer.invoke(C.PROVIDER_TEST, p), generateWithProvider: (p: string, q: string) => ipcRenderer.invoke(C.PROVIDER_GENERATE, p, q),
  onEmergencyStopTriggered: (cb: (reason: string) => void) => { const h = (_e: unknown, r: string) => cb(r); ipcRenderer.on('mio:event:emergencyStop', h); return () => ipcRenderer.removeListener('mio:event:emergencyStop', h); },
  onNavigate: (cb: (mode: string) => void) => { const h = (_e: unknown, m: string) => cb(m); ipcRenderer.on('mio:navigate', h); return () => ipcRenderer.removeListener('mio:navigate', h); },
};

contextBridge.exposeInMainWorld('mioDesktop', Object.freeze(api));
