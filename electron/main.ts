import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { IPC_CHANNELS } from './ipc/channels';
import { setupIpcHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// Enforce single instance lock
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
    frame: false, // Custom futuristic titlebar with window controls
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for custom preload with node path mapping
      webSecurity: true,
    },
  });

  const handlers = setupIpcHandlers(mainWindow);

  // Register IPC listeners
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, handlers.handleMinimize);
  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, handlers.handleMaximize);
  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, handlers.handleClose);
  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, handlers.handleIsMaximized);

  ipcMain.handle(IPC_CHANNELS.GET_SYSTEM_INFO, handlers.handleGetSystemInfo);
  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, handlers.handleGetAppVersion);

  ipcMain.handle(IPC_CHANNELS.SHOW_NOTIFICATION, handlers.handleShowNotification);
  ipcMain.handle(IPC_CHANNELS.EMERGENCY_STOP, handlers.handleEmergencyStop);
  ipcMain.handle(IPC_CHANNELS.QUIT_APP, () => {
    isQuitting = true;
    app.quit();
  });

  ipcMain.handle(IPC_CHANNELS.FS_SELECT_DIRECTORY, handlers.handleSelectDirectory);
  ipcMain.handle(IPC_CHANNELS.FS_READ_FILE, handlers.handleReadFile);
  ipcMain.handle(IPC_CHANNELS.FS_WRITE_FILE, handlers.handleWriteFile);
  ipcMain.handle(IPC_CHANNELS.FS_LIST_DIRECTORY, handlers.handleListDirectory);

  // Load URL or dist file
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Hide instead of close if user configures background execution
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      // For standard desktop behavior, can hide or close
      // Default to standard close unless minimized to tray
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createTray() {
  // Create 16x16 monochrome cyan tray icon representation
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
        if (mainWindow) {
          mainWindow.webContents.send('mio:event:emergencyStop', 'Triggered from System Tray');
        }
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
      click: () => {
        isQuitting = true;
        app.quit();
      },
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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
