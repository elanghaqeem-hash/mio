import { BrowserWindow, dialog, Notification, app, IpcMainInvokeEvent } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_NOTIFICATION_CHARS = 500;
let authorizedWorkspaceRoot: string | null = null;

function cleanError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 300);
  return 'Unexpected filesystem error';
}

function normalizeRealPath(targetPath: string): string {
  return path.resolve(targetPath);
}

function isInsideRoot(candidate: string, root: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function validateScopedPath(targetPath: unknown, mustExist = false): Promise<string> {
  if (typeof targetPath !== 'string' || targetPath.length === 0 || targetPath.length > 4096) {
    throw new Error('Invalid filesystem path');
  }
  if (!authorizedWorkspaceRoot) throw new Error('No workspace directory has been authorized');

  const root = normalizeRealPath(authorizedWorkspaceRoot);
  const candidate = normalizeRealPath(targetPath);
  if (!isInsideRoot(candidate, root)) throw new Error('Path escapes the authorized workspace');

  if (mustExist) {
    const real = await fs.promises.realpath(candidate);
    if (!isInsideRoot(real, root)) throw new Error('Resolved path escapes the authorized workspace');
    return real;
  }

  // Prevent writing through an existing symlinked parent that points outside the workspace.
  let cursor = path.dirname(candidate);
  while (isInsideRoot(cursor, root) && cursor !== path.dirname(cursor)) {
    try {
      const stat = await fs.promises.lstat(cursor);
      if (stat.isSymbolicLink()) {
        const real = await fs.promises.realpath(cursor);
        if (!isInsideRoot(real, root)) throw new Error('Symlinked parent escapes the authorized workspace');
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }
    if (cursor === root) break;
    cursor = path.dirname(cursor);
  }
  return candidate;
}

function assertTrustedSender(event: IpcMainInvokeEvent, mainWindow: BrowserWindow): void {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    throw new Error('Untrusted IPC sender');
  }
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!senderUrl.startsWith('file://') && !senderUrl.startsWith('http://localhost:5173') && !senderUrl.startsWith('http://127.0.0.1:5173')) {
    throw new Error('IPC sender origin is not trusted');
  }
}

export function setupIpcHandlers(mainWindow: BrowserWindow) {
  return {
    handleMinimize: (event: IpcMainInvokeEvent) => {
      assertTrustedSender(event, mainWindow);
      mainWindow.minimize();
    },
    handleMaximize: (event: IpcMainInvokeEvent) => {
      assertTrustedSender(event, mainWindow);
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        return false;
      }
      mainWindow.maximize();
      return true;
    },
    handleClose: (event: IpcMainInvokeEvent) => {
      assertTrustedSender(event, mainWindow);
      mainWindow.close();
    },
    handleIsMaximized: (event: IpcMainInvokeEvent) => {
      assertTrustedSender(event, mainWindow);
      return mainWindow.isMaximized();
    },

    handleGetSystemInfo: (event: IpcMainInvokeEvent) => {
      assertTrustedSender(event, mainWindow);
      return {
        platform: process.platform,
        arch: process.arch,
        osVersion: os.release(),
        totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
        freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
        cpuCores: os.cpus().length,
      };
    },
    handleGetAppVersion: (event: IpcMainInvokeEvent) => {
      assertTrustedSender(event, mainWindow);
      return app.getVersion();
    },

    handleShowNotification: (event: IpcMainInvokeEvent, options: { title?: unknown; body?: unknown; silent?: unknown }) => {
      assertTrustedSender(event, mainWindow);
      if (!Notification.isSupported()) return;
      const title = typeof options?.title === 'string' ? options.title.slice(0, 120) : 'Mio V2 Notification';
      const body = typeof options?.body === 'string' ? options.body.slice(0, MAX_NOTIFICATION_CHARS) : '';
      new Notification({ title, body, silent: options?.silent === true }).show();
    },

    handleEmergencyStop: (event: IpcMainInvokeEvent, reason: unknown) => {
      assertTrustedSender(event, mainWindow);
      const safeReason = typeof reason === 'string' ? reason.slice(0, 300) : 'User requested emergency stop';
      console.warn('[ELECTRON MAIN] Emergency Stop Triggered');
      mainWindow.webContents.send('mio:event:emergencyStop', safeReason);
    },

    handleSelectDirectory: async (event: IpcMainInvokeEvent) => {
      assertTrustedSender(event, mainWindow);
      const res = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Authorized Workspace Directory for Mio',
      });
      if (res.canceled || res.filePaths.length === 0) return null;
      const selected = await fs.promises.realpath(res.filePaths[0]);
      authorizedWorkspaceRoot = selected;
      return selected;
    },

    handleGetWorkspace: (event: IpcMainInvokeEvent) => {
      assertTrustedSender(event, mainWindow);
      return authorizedWorkspaceRoot;
    },

    handleReadFile: async (event: IpcMainInvokeEvent, filePath: unknown) => {
      assertTrustedSender(event, mainWindow);
      try {
        const safePath = await validateScopedPath(filePath, true);
        const stat = await fs.promises.stat(safePath);
        if (!stat.isFile()) return { success: false, error: 'Target is not a regular file' };
        if (stat.size > MAX_TEXT_FILE_BYTES) return { success: false, error: 'File exceeds the 10 MB safety limit' };
        const content = await fs.promises.readFile(safePath, 'utf-8');
        return { success: true, data: content };
      } catch (err) {
        return { success: false, error: cleanError(err) };
      }
    },

    handleWriteFile: async (event: IpcMainInvokeEvent, filePath: unknown, content: unknown) => {
      assertTrustedSender(event, mainWindow);
      try {
        if (typeof content !== 'string') return { success: false, error: 'Only UTF-8 text writes are supported' };
        if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_FILE_BYTES) return { success: false, error: 'Content exceeds the 10 MB safety limit' };
        const safePath = await validateScopedPath(filePath, false);
        await fs.promises.mkdir(path.dirname(safePath), { recursive: true });
        await fs.promises.writeFile(safePath, content, { encoding: 'utf-8', flag: 'w' });
        return { success: true };
      } catch (err) {
        return { success: false, error: cleanError(err) };
      }
    },

    handleListDirectory: async (event: IpcMainInvokeEvent, dirPath: unknown) => {
      assertTrustedSender(event, mainWindow);
      try {
        const safePath = await validateScopedPath(dirPath, true);
        const stat = await fs.promises.stat(safePath);
        if (!stat.isDirectory()) return { success: false, error: 'Target is not a directory' };
        const entries = await fs.promises.readdir(safePath, { withFileTypes: true });
        return {
          success: true,
          files: entries.slice(0, 2000).map((entry) => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' })),
        };
      } catch (err) {
        return { success: false, error: cleanError(err) };
      }
    },

    handleMoveFile: async (event: IpcMainInvokeEvent, sourcePath: unknown, destinationPath: unknown) => {
      assertTrustedSender(event, mainWindow);
      try {
        const src = await validateScopedPath(sourcePath, true);
        const dst = await validateScopedPath(destinationPath, false);
        const stat = await fs.promises.stat(src);
        if (!stat.isFile()) return { success: false, error: 'Only regular files can be moved' };
        await fs.promises.mkdir(path.dirname(dst), { recursive: true });
        try {
          await fs.promises.access(dst);
          return { success: false, error: 'Destination already exists; overwrite is blocked' };
        } catch {}
        await fs.promises.rename(src, dst);
        return { success: true };
      } catch (err) {
        return { success: false, error: cleanError(err) };
      }
    },
  };
}
