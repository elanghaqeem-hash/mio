import { BrowserWindow, dialog, Notification, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function setupIpcHandlers(mainWindow: BrowserWindow) {
  const isPathSafe = (targetPath: string): boolean => {
    const normalized = path.normalize(targetPath);
    // Disallow accessing root critical Windows directories
    const winDir = process.env.WINDIR || 'C:\\Windows';
    if (normalized.toLowerCase().startsWith(winDir.toLowerCase())) {
      return false;
    }
    return true;
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
      } else {
        mainWindow.maximize();
        return true;
      }
    },
    handleClose: () => {
      if (mainWindow) mainWindow.close();
    },
    handleIsMaximized: () => {
      return mainWindow ? mainWindow.isMaximized() : false;
    },

    // System Telemetry
    handleGetSystemInfo: () => {
      return {
        platform: process.platform,
        arch: process.arch,
        osVersion: os.release(),
        totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
        freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
        cpuCores: os.cpus().length,
      };
    },
    handleGetAppVersion: () => {
      return app.getVersion();
    },

    // Desktop Notifications
    handleShowNotification: (_: any, options: { title: string; body: string; silent?: boolean }) => {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: options.title || 'Mio V2 Notification',
          body: options.body || '',
          silent: options.silent || false,
        });
        notif.show();
      }
    },

    // Emergency Stop
    handleEmergencyStop: (_: any, reason: string) => {
      console.warn(`[ELECTRON MAIN] Emergency Stop Triggered: ${reason}`);
      if (mainWindow) {
        mainWindow.webContents.send('mio:event:emergencyStop', reason);
      }
    },

    // Scoped File Access (L0-L5 sandbox)
    handleSelectDirectory: async () => {
      const res = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Authorized Workspace Directory for Mio',
      });
      if (res.canceled || res.filePaths.length === 0) return null;
      return res.filePaths[0];
    },

    handleReadFile: async (_: any, filePath: string) => {
      if (!isPathSafe(filePath)) {
        return { success: false, error: 'Path rejected by Security Sandbox' };
      }
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return { success: true, data: content };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },

    handleWriteFile: async (_: any, filePath: string, content: string) => {
      if (!isPathSafe(filePath)) {
        return { success: false, error: 'Path rejected by Security Sandbox' };
      }
      try {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, 'utf-8');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },

    handleListDirectory: async (_: any, dirPath: string) => {
      if (!isPathSafe(dirPath)) {
        return { success: false, error: 'Directory path rejected by Security Sandbox' };
      }
      try {
        const files = await fs.promises.readdir(dirPath);
        return { success: true, files };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  };
}
