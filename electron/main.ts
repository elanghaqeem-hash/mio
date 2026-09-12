import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IPC_CHANNELS } from './ipc/channels';
import { setupIpcHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const DEV_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function isTrustedNavigationUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'file:') return true;
    return DEV_ORIGINS.has(url.origin);
  } catch {
    return false;
  }
}

function registerIpcHandlers(window: BrowserWindow) {
  const handlers = setupIpcHandlers(window);
  const registrations: Array<[string, (...args: any[]) => any]> = [
    [IPC_CHANNELS.WINDOW_MINIMIZE, handlers.handleMinimize],
    [IPC_CHANNELS.WINDOW_MAXIMIZE, handlers.handleMaximize],
    [IPC_CHANNELS.WINDOW_CLOSE, handlers.handleClose],
    [IPC_CHANNELS.WINDOW_IS_MAXIMIZED, handlers.handleIsMaximized],
    [IPC_CHANNELS.GET_SYSTEM_INFO, handlers.handleGetSystemInfo],
    [IPC_CHANNELS.GET_APP_VERSION, handlers.handleGetAppVersion],
    [IPC_CHANNELS.SHOW_NOTIFICATION, handlers.handleShowNotification],
    [IPC_CHANNELS.EMERGENCY_STOP, handlers.handleEmergencyStop],
    [IPC_CHANNELS.FS_SELECT_DIRECTORY, handlers.handleSelectDirectory],
    [IPC_CHANNELS.FS_GET_WORKSPACE, handlers.handleGetWorkspace],
    [IPC_CHANNELS.FS_READ_FILE, handlers.handleReadFile],
    [IPC_CHANNELS.FS_WRITE_FILE, handlers.handleWriteFile],
    [IPC_CHANNELS.FS_LIST_DIRECTORY, handlers.handleListDirectory],
    [IPC_CHANNELS.FS_MOVE_FILE, handlers.handleMoveFile],
  ];

  for (const [channel, handler] of registrations) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, handler as any);
  }

  ipcMain.removeHandler(IPC_CHANNELS.QUIT_APP);
  ipcMain.handle(IPC_CHANNELS.QUIT_APP, (event) => {
    if (event.sender.id !== window.webContents.id) throw new Error('Untrusted IPC sender');
    isQuitting = true;
    app.quit();
  });
}

function createWindow(): BrowserWindow {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#07090e',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      devTools: isDev,
    },
  });

  registerIpcHandlers(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedNavigationUrl(url)) event.preventDefault();
  });

  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
    if (app.isPackaged) return;
    const sanitizedMessage = String(message).replace(/[\r\n]+/g, ' ').slice(0, 2000);
    const sanitizedSource = String(sourceId).slice(0, 500);
    const logMsg = `[Renderer Console] [Level ${level}]: ${sanitizedMessage} (${sanitizedSource}:${line})\n`;
    try {
      fs.appendFileSync(path.join(app.getPath('userData'), 'renderer.log'), logMsg, { encoding: 'utf8' });
    } catch {}
  });

  const distHtmlPath = path.join(__dirname, '../dist/index.html');
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  const showOnReady = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  };
  mainWindow.once('ready-to-show', showOnReady);

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(devUrl).catch(() => mainWindow?.loadFile(distHtmlPath));
  } else if (fs.existsSync(distHtmlPath)) {
    mainWindow.loadFile(distHtmlPath);
  } else if (isDev) {
    mainWindow.loadURL(devUrl).catch(() => mainWindow?.loadFile(distHtmlPath));
  } else {
    throw new Error('Mio production bundle is missing dist/index.html');
  }

  if (isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') {
        mainWindow?.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error(`[Mio Window] Failed to load ${validatedURL}: ${errorCode} (${errorDescription})`);
    if (!isDev && fs.existsSync(distHtmlPath)) mainWindow?.loadFile(distHtmlPath);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Mio V2 — AI Operating Environment');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Mio V2', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'STOP MIO (Emergency Interrupt)', click: () => mainWindow?.webContents.send('mio:event:emergencyStop', 'Triggered from System Tray') },
    { type: 'separator' },
    { label: 'Security Center', click: () => { mainWindow?.show(); mainWindow?.webContents.send('mio:navigate', 'SECURITY'); } },
    { type: 'separator' },
    { label: 'Quit Mio completely', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    // Camera/microphone permission is still requested by the renderer through browser APIs;
    // all other privileged permission families are denied by default.
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media');

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || isQuitting) app.quit();
});
