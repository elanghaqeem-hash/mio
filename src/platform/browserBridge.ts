import type { MioDesktopAPI } from '../../electron/preload';

const DB_NAME = 'mio-web-runtime';
const DB_VERSION = 1;
const MAX_TEXT_BYTES = 10 * 1024 * 1024;
const MAX_AUDIT_EVENTS = 1000;

type PickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

type StoredAudit = {
  id?: number;
  timestamp: number;
  category: string;
  action: string;
  details: string;
  blocked: boolean;
};

let workspaceHandle: FileSystemDirectoryHandle | null = null;
let workspaceUri: string | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is unavailable in this browser'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['settings', 'projects']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
      if (!db.objectStoreNames.contains('audit')) {
        db.createObjectStore('audit', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

async function dbGet<T>(store: string, key: IDBValidKey): Promise<T | null> {
  const db = await openDb();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function dbPut(store: string, key: IDBValidKey, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function appendAudit(category: string, action: string, details: string, blocked = false) {
  try {
    const db = await openDb();
    const tx = db.transaction('audit', 'readwrite');
    const store = tx.objectStore('audit');
    store.add({ timestamp: Date.now(), category, action, details: details.slice(0, 2000), blocked } satisfies StoredAudit);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Audit persistence is best effort in privacy modes where IndexedDB is blocked.
  }
}

function sanitizeRelativeSegments(target: string): string[] {
  if (!workspaceUri || !workspaceHandle) throw new Error('No browser workspace has been authorized');
  const normalized = target.replace(/\\/g, '/');
  if (!normalized.startsWith(workspaceUri)) throw new Error('Path escapes the authorized browser workspace');
  const relative = normalized.slice(workspaceUri.length).replace(/^\/+/, '');
  if (!relative) return [];
  const parts = relative.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || part.includes('\0'))) throw new Error('Unsafe workspace path');
  return parts;
}

async function directoryFor(parts: string[], create = false): Promise<FileSystemDirectoryHandle> {
  if (!workspaceHandle) throw new Error('No browser workspace has been authorized');
  let current = workspaceHandle;
  for (const part of parts) current = await current.getDirectoryHandle(part, { create });
  return current;
}

async function fileHandleFor(target: string, create = false): Promise<{ parent: FileSystemDirectoryHandle; file: FileSystemFileHandle; name: string }> {
  const parts = sanitizeRelativeSegments(target);
  if (parts.length === 0) throw new Error('A file path is required');
  const name = parts[parts.length - 1];
  const parent = await directoryFor(parts.slice(0, -1), create);
  const file = await parent.getFileHandle(name, { create });
  return { parent, file, name };
}

async function fetchJson(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.error || `HTTP ${response.status}`));
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function listAudit(limit = 200): Promise<StoredAudit[]> {
  const db = await openDb();
  try {
    return await new Promise<StoredAudit[]>((resolve, reject) => {
      const rows: StoredAudit[] = [];
      const req = db.transaction('audit', 'readonly').objectStore('audit').openCursor(null, 'prev');
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || rows.length >= Math.min(Math.max(limit, 1), MAX_AUDIT_EVENTS)) {
          resolve(rows);
          return;
        }
        rows.push(cursor.value as StoredAudit);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

function createBrowserApi(): MioDesktopAPI {
  const api = {
    minimizeWindow: async () => undefined,
    maximizeWindow: async () => false,
    closeWindow: async () => undefined,
    isMaximized: async () => false,
    getSystemInfo: async () => ({
      platform: navigator.platform || 'web',
      arch: 'browser',
      osVersion: navigator.userAgent.slice(0, 180),
      totalMemMb: Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0) * 1024,
      freeMemMb: 0,
      cpuCores: navigator.hardwareConcurrency || 0,
    }),
    getAppVersion: async () => '1.0.0-web',
    getSecurityStatus: async () => ({
      runtime: 'web',
      secureContext: window.isSecureContext,
      origin: window.location.origin,
      sandbox: null,
      contextIsolation: null,
      nodeIntegration: null,
      webSecurity: true,
      devTools: false,
      osSecretEncryption: false,
      serverManagedSecrets: true,
      indexedDb: 'indexedDB' in window,
      fileSystemAccess: typeof (window as PickerWindow).showDirectoryPicker === 'function',
      workspace: workspaceUri,
    }),
    showNotification: async (options: { title: string; body: string; silent?: boolean }) => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      new Notification(options.title.slice(0, 120), { body: options.body.slice(0, 500), silent: options.silent === true });
    },
    triggerEmergencyStop: async (reason: string) => {
      window.dispatchEvent(new CustomEvent('mio:web:emergencyStop', { detail: String(reason).slice(0, 300) }));
      await appendAudit('SECURITY', 'EMERGENCY_STOP', String(reason), false);
    },
    quitApp: async () => undefined,
    selectDirectory: async () => {
      const picker = (window as PickerWindow).showDirectoryPicker;
      if (!picker) throw new Error('This browser does not support the File System Access API. Use current Chromium-based Chrome/Edge for FILES mode.');
      workspaceHandle = await picker();
      workspaceUri = `browser://${workspaceHandle.name}`;
      await appendAudit('FILESYSTEM', 'AUTHORIZE_WORKSPACE', `Authorized browser workspace ${workspaceHandle.name}`, false);
      return workspaceUri;
    },
    getWorkspace: async () => workspaceUri,
    readFile: async (filePath: string) => {
      try {
        const { file } = await fileHandleFor(filePath, false);
        const value = await file.getFile();
        if (value.size > MAX_TEXT_BYTES) return { success: false, error: 'File exceeds the 10 MB browser safety limit' };
        return { success: true, data: await value.text() };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Browser file read failed' };
      }
    },
    writeFile: async (filePath: string, content: string) => {
      try {
        if (new TextEncoder().encode(content).byteLength > MAX_TEXT_BYTES) return { success: false, error: 'Content exceeds the 10 MB browser safety limit' };
        const { file } = await fileHandleFor(filePath, true);
        const writable = await file.createWritable();
        await writable.write(content);
        await writable.close();
        await appendAudit('FILESYSTEM', 'WRITE_FILE', filePath, false);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Browser file write failed' };
      }
    },
    listDirectory: async (dirPath: string) => {
      try {
        const handle = await directoryFor(sanitizeRelativeSegments(dirPath), false);
        const files: Array<{ name: string; type: 'file' | 'directory' }> = [];
        for await (const entry of handle.values()) {
          files.push({ name: entry.name, type: entry.kind === 'directory' ? 'directory' : 'file' });
          if (files.length >= 2000) break;
        }
        return { success: true, files };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Browser directory listing failed' };
      }
    },
    moveFile: async (sourcePath: string, destinationPath: string) => {
      try {
        const source = await fileHandleFor(sourcePath, false);
        const destinationParts = sanitizeRelativeSegments(destinationPath);
        if (!destinationParts.length) throw new Error('Destination file path is required');
        const destinationName = destinationParts[destinationParts.length - 1];
        const destinationParent = await directoryFor(destinationParts.slice(0, -1), true);
        try {
          await destinationParent.getFileHandle(destinationName, { create: false });
          return { success: false, error: 'Destination already exists; overwrite is blocked' };
        } catch (error) {
          if (error instanceof DOMException && error.name !== 'NotFoundError') throw error;
        }
        const sourceFile = await source.file.getFile();
        const destination = await destinationParent.getFileHandle(destinationName, { create: true });
        const writable = await destination.createWritable();
        await writable.write(sourceFile);
        await writable.close();
        await source.parent.removeEntry(source.name);
        await appendAudit('FILESYSTEM', 'MOVE_FILE', `${sourcePath} -> ${destinationPath}`, false);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Browser file move failed';
        await appendAudit('FILESYSTEM', 'MOVE_FILE', message, true);
        return { success: false, error: message };
      }
    },
    getDatabaseStatus: async () => {
      try {
        const db = await openDb();
        db.close();
        return { connected: true, engine: 'IndexedDB', path: 'browser-profile', schemaVersion: String(DB_VERSION), journalMode: 'browser-managed' };
      } catch (error) {
        return { connected: false, engine: 'IndexedDB', error: error instanceof Error ? error.message : 'IndexedDB unavailable' };
      }
    },
    getSetting: async <T>(key: string, fallback: T): Promise<T> => (await dbGet<T>('settings', key)) ?? fallback,
    setSetting: async (key: string, value: unknown) => dbPut('settings', key, value),
    loadProject: async (id: string) => dbGet<any>('projects', id),
    saveProject: async (project: any) => {
      if (!project || typeof project !== 'object' || typeof project.id !== 'string') throw new Error('Invalid project payload');
      await dbPut('projects', project.id, project);
    },
    listAudit,
    listProviders: async () => {
      try {
        const data = await fetchJson('/api/capabilities');
        return Array.isArray(data?.aiProviders) ? data.aiProviders : [];
      } catch {
        return [];
      }
    },
    saveProvider: async () => { throw new Error('Web provider secrets are server-managed. Configure secrets in Cloudflare Pages, not in the browser.'); },
    removeProvider: async () => { throw new Error('Web provider configuration is managed in Cloudflare Pages.'); },
    testProvider: async (provider: string) => fetchJson('/api/ai', { method: 'POST', body: JSON.stringify({ provider, connectionTest: true, prompt: 'Reply with exactly: MIO_CONNECTION_OK' }) }),
    generateWithProvider: async (provider: string, prompt: string) => fetchJson('/api/ai', { method: 'POST', body: JSON.stringify({ provider, prompt }) }),
    onEmergencyStopTriggered: (callback: (reason: string) => void) => {
      const listener = (event: Event) => callback(String((event as CustomEvent).detail || 'Emergency stop'));
      window.addEventListener('mio:web:emergencyStop', listener);
      return () => window.removeEventListener('mio:web:emergencyStop', listener);
    },
    onNavigate: () => () => undefined,
  } satisfies MioDesktopAPI;
  return Object.freeze(api);
}

export function installBrowserBridge() {
  if (window.mioDesktop) return;
  Object.defineProperty(window, 'mioDesktop', { value: createBrowserApi(), writable: false, configurable: false });
}
