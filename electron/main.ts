import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, shell, dialog, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IPC_CHANNELS } from './ipc/channels';
import { setupIpcHandlers } from './ipc/handlers';
import { DatabaseService } from './services/DatabaseService';
import { ProviderService } from './services/ProviderService';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let database: DatabaseService | null = null;
let providers: ProviderService | null = null;
const DEV_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();
else app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });

function isTrustedNavigationUrl(rawUrl: string): boolean {
  try { const url = new URL(rawUrl); return url.protocol === 'file:' || DEV_ORIGINS.has(url.origin); } catch { return false; }
}

function assertServiceSender(event: Electron.IpcMainInvokeEvent, window: BrowserWindow) {
  if (event.sender.id !== window.webContents.id) throw new Error('Untrusted IPC sender');
  const url = event.senderFrame?.url || event.sender.getURL();
  if (!isTrustedNavigationUrl(url)) throw new Error('Untrusted IPC origin');
}

function validSettingKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(value)) throw new Error('Invalid setting key');
  return value;
}

function registerIpcHandlers(window: BrowserWindow) {
  if (!database || !providers) throw new Error('Core services are not initialized');
  const handlers = setupIpcHandlers(window);
  const registrations: Array<[string, (...args: any[]) => any]> = [
    [IPC_CHANNELS.WINDOW_MINIMIZE, handlers.handleMinimize], [IPC_CHANNELS.WINDOW_MAXIMIZE, handlers.handleMaximize], [IPC_CHANNELS.WINDOW_CLOSE, handlers.handleClose], [IPC_CHANNELS.WINDOW_IS_MAXIMIZED, handlers.handleIsMaximized],
    [IPC_CHANNELS.GET_SYSTEM_INFO, handlers.handleGetSystemInfo], [IPC_CHANNELS.GET_APP_VERSION, handlers.handleGetAppVersion], [IPC_CHANNELS.SHOW_NOTIFICATION, handlers.handleShowNotification], [IPC_CHANNELS.EMERGENCY_STOP, handlers.handleEmergencyStop],
    [IPC_CHANNELS.FS_SELECT_DIRECTORY, handlers.handleSelectDirectory], [IPC_CHANNELS.FS_GET_WORKSPACE, handlers.handleGetWorkspace], [IPC_CHANNELS.FS_READ_FILE, handlers.handleReadFile], [IPC_CHANNELS.FS_WRITE_FILE, handlers.handleWriteFile], [IPC_CHANNELS.FS_LIST_DIRECTORY, handlers.handleListDirectory], [IPC_CHANNELS.FS_MOVE_FILE, handlers.handleMoveFile],
  ];
  for (const [channel, handler] of registrations) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler as any); }

  const add = (channel: string, fn: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, fn); };
  add(IPC_CHANNELS.QUIT_APP, (event) => { assertServiceSender(event, window); isQuitting = true; app.quit(); });
  add(IPC_CHANNELS.GET_SECURITY_STATUS, (event) => { assertServiceSender(event, window); return { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: !app.isPackaged, osSecretEncryption: safeStorage.isEncryptionAvailable(), production: app.isPackaged }; });
  add(IPC_CHANNELS.DB_STATUS, (event) => { assertServiceSender(event, window); return database!.getStatus(); });
  add(IPC_CHANNELS.SETTINGS_GET, (event, key, fallback) => { assertServiceSender(event, window); return database!.getSetting(validSettingKey(key), fallback); });
  add(IPC_CHANNELS.SETTINGS_SET, (event, key, value) => { assertServiceSender(event, window); database!.setSetting(validSettingKey(key), value); });
  add(IPC_CHANNELS.PROJECT_LOAD, (event, id) => { assertServiceSender(event, window); if (typeof id !== 'string' || id.length > 200) throw new Error('Invalid project id'); return database!.loadProject(id); });
  add(IPC_CHANNELS.PROJECT_SAVE, (event, project) => { assertServiceSender(event, window); database!.saveProject(project); });
  add(IPC_CHANNELS.AUDIT_LIST, (event, limit) => { assertServiceSender(event, window); return database!.listAudit(typeof limit === 'number' ? limit : 200); });
  add(IPC_CHANNELS.PROVIDER_LIST, (event) => { assertServiceSender(event, window); return providers!.list(); });
  add(IPC_CHANNELS.PROVIDER_SAVE, (event, input) => { assertServiceSender(event, window); return providers!.save(input); });
  add(IPC_CHANNELS.PROVIDER_REMOVE, (event, provider) => { assertServiceSender(event, window); providers!.remove(provider); });
  add(IPC_CHANNELS.PROVIDER_TEST, async (event, provider) => { assertServiceSender(event, window); return providers!.test(provider); });
  add(IPC_CHANNELS.PROVIDER_GENERATE, async (event, provider, prompt) => { assertServiceSender(event, window); return providers!.generate(provider, prompt); });
}

function createWindow(): BrowserWindow {
  const isDev = !app.isPackaged;
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700, backgroundColor: '#07090e', frame: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false, devTools: isDev },
  });
  registerIpcHandlers(mainWindow);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url).catch(() => undefined); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!isTrustedNavigationUrl(url)) event.preventDefault(); });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
    if (app.isPackaged) return;
    try { fs.appendFileSync(path.join(app.getPath('userData'), 'renderer.log'), `[Renderer ${level}] ${String(message).replace(/[\r\n]+/g, ' ').slice(0, 2000)} (${String(sourceId).slice(0, 500)}:${line})\n`, 'utf8'); } catch {}
  });
  const distHtmlPath = path.join(__dirname, '../dist/index.html');
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  mainWindow.once('ready-to-show', () => { mainWindow?.show(); mainWindow?.focus(); });
  if (isDev && process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(devUrl).catch(() => mainWindow?.loadFile(distHtmlPath));
  else if (fs.existsSync(distHtmlPath)) mainWindow.loadFile(distHtmlPath);
  else if (isDev) mainWindow.loadURL(devUrl).catch(() => mainWindow?.loadFile(distHtmlPath));
  else throw new Error('Mio production bundle is missing dist/index.html');
  if (isDev) mainWindow.webContents.on('before-input-event', (event, input) => { if (input.key === 'F12' && input.type === 'keyDown') { mainWindow?.webContents.toggleDevTools(); event.preventDefault(); } });
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Mio V2 — AI Operating Environment');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Mio V2', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'STOP MIO (Emergency Interrupt)', click: () => mainWindow?.webContents.send('mio:event:emergencyStop', 'Triggered from System Tray') },
    { type: 'separator' }, { label: 'Security Center', click: () => { mainWindow?.show(); mainWindow?.webContents.send('mio:navigate', 'SECURITY'); } },
    { type: 'separator' }, { label: 'Quit Mio completely', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

app.whenReady().then(() => {
  database = new DatabaseService(path.join(app.getPath('userData'), 'mio-v2.sqlite3'));
  providers = new ProviderService(database);

  session.defaultSession.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
    if (!mainWindow || webContents.id !== mainWindow.webContents.id || !isTrustedNavigationUrl(webContents.getURL()) || permission !== 'media') return callback(false);
    const mediaTypes = Array.isArray((details as any)?.mediaTypes) ? (details as any).mediaTypes.filter((x: unknown) => x === 'audio' || x === 'video') : [];
    if (!mediaTypes.length) return callback(false);
    const result = await dialog.showMessageBox(mainWindow, { type: 'warning', buttons: ['Allow once', 'Deny'], defaultId: 1, cancelId: 1, noLink: true, title: 'MIO Media Permission', message: `Allow MIO to access ${mediaTypes.join(' and ')} for this request?`, detail: 'Media access is granted only to the trusted local MIO renderer. Choose Deny unless you initiated this action.' });
    database?.appendAudit('PERMISSION', 'MEDIA_ACCESS', `${mediaTypes.join(',')} ${result.response === 0 ? 'allowed' : 'denied'}`, result.response !== 0);
    callback(result.response === 0);
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => Boolean(mainWindow && webContents?.id === mainWindow.webContents.id && isTrustedNavigationUrl(webContents.getURL()) && permission === 'media'));

  createWindow(); createTray();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { try { database?.close(); } catch {} database = null; providers = null; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' || isQuitting) app.quit(); });
