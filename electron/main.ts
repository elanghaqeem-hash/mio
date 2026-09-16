import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, Menu, nativeImage, Tray } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS } from './ipc/channels';
import { setupIpcHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

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

function createWindow(): BrowserWindow {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#07090e',
    frame: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.show();
  mainWindow.focus();

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedDevUrl = process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL);
    const allowedFileUrl = url.startsWith('file://');
    if (!allowedDevUrl && !allowedFileUrl) event.preventDefault();
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const logMsg = `[Renderer Console] [Level ${level}]: ${message} (${sourceId}:${line})\n`;
    try {
      fs.appendFileSync(path.join(app.getPath('userData'), 'renderer.log'), logMsg);
    } catch {
      // Diagnostic logging must never block the application lifecycle.
    }
  });

  const handlers = setupIpcHandlers(mainWindow);
  const assertTrustedSender = (event: IpcMainInvokeEvent) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('Rejected IPC invocation from untrusted renderer frame');
    }
  };
  const secureHandle = (
    channel: string,
    handler: (event: IpcMainInvokeEvent, args: unknown[]) => unknown | Promise<unknown>,
  ) => {
    ipcMain.handle(channel, async (event, ...args) => {
      assertTrustedSender(event);
      return handler(event, args);
    });
  };

  secureHandle(IPC_CHANNELS.WINDOW_MINIMIZE, () => handlers.handleMinimize());
  secureHandle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => handlers.handleMaximize());
  secureHandle(IPC_CHANNELS.WINDOW_CLOSE, () => handlers.handleClose());
  secureHandle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => handlers.handleIsMaximized());
  secureHandle(IPC_CHANNELS.GET_SYSTEM_INFO, () => handlers.handleGetSystemInfo());
  secureHandle(IPC_CHANNELS.GET_APP_VERSION, () => handlers.handleGetAppVersion());
  secureHandle(IPC_CHANNELS.SHOW_NOTIFICATION, (event, args) => handlers.handleShowNotification(event, args[0]));
  secureHandle(IPC_CHANNELS.EMERGENCY_STOP, (event, args) => handlers.handleEmergencyStop(event, args[0]));
  secureHandle(IPC_CHANNELS.QUIT_APP, () => {
    handlers.revokeAllWorkspaceAuthority();
    app.quit();
  });
  secureHandle(IPC_CHANNELS.FS_AUTHORIZE_WORKSPACE, () => handlers.handleAuthorizeWorkspace());
  secureHandle(IPC_CHANNELS.FS_REVOKE_WORKSPACE, (event, args) => handlers.handleRevokeWorkspace(event, args[0]));
  secureHandle(IPC_CHANNELS.FS_READ_WORKSPACE_TEXT, (event, args) => handlers.handleReadWorkspaceText(event, args[0]));
  secureHandle(IPC_CHANNELS.FS_LIST_WORKSPACE, (event, args) => handlers.handleListWorkspace(event, args[0]));
  secureHandle(IPC_CHANNELS.BROWSER_READ_PAGE, (event, args) => handlers.handleBrowserReadPage(event, args[0]));

  const distHtmlPath = path.join(__dirname, '../dist/index.html');
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(devUrl).catch(() => mainWindow?.loadFile(distHtmlPath));
  } else if (fs.existsSync(distHtmlPath)) {
    mainWindow.loadFile(distHtmlPath);
  } else {
    mainWindow.loadURL(devUrl).catch(() => mainWindow?.loadFile(distHtmlPath));
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isDev && input.key === 'F12' && input.type === 'keyDown') {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[Mio Window] Failed to load: ${errorCode} (${errorDescription})`);
    if (fs.existsSync(distHtmlPath)) mainWindow?.loadFile(distHtmlPath);
  });

  mainWindow.on('closed', () => {
    handlers.revokeAllWorkspaceAuthority();
    mainWindow = null;
  });

  return mainWindow;
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Mio V2 — AI Operating Environment');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Mio V2',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'STOP MIO (Emergency Interrupt)',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('mio:event:emergencyStop', 'Triggered from System Tray');
      },
    },
    { type: 'separator' },
    {
      label: 'Security Center',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('mio:navigate', 'SECURITY');
        }
      },
    },
    {
      label: 'Privacy Center',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('mio:navigate', 'SECURITY');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Mio completely',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
