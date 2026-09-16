import { BrowserWindow, session } from 'electron';
import { promises as dns } from 'dns';
import { randomUUID } from 'crypto';
import { isIP } from 'net';

export interface BrowserReadRequest {
  url: string;
}

export interface BrowserReadResult {
  title: string;
  url: string;
  text: string;
  truncated: boolean;
}

const MAX_URL_LENGTH = 2048;
const MAX_TEXT_CHARS = 60_000;
const MAX_TITLE_CHARS = 512;
const LOAD_TIMEOUT_MS = 15_000;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('ff')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:192.168.')
    || /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(normalized);
}

function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

function parseHttpsUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_URL_LENGTH) throw new Error('Browser URL is missing or exceeds the bounded length');
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Browser URL is invalid');
  }
  if (url.protocol !== 'https:') throw new Error('MIO browser bridge allows HTTPS targets only');
  if (url.username || url.password) throw new Error('Credentials embedded in browser URLs are not allowed');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Local/private browser targets are blocked');
  }
  return url;
}

async function assertPublicTarget(raw: unknown): Promise<URL> {
  const url = parseHttpsUrl(raw);
  if (isIP(url.hostname)) {
    if (isBlockedAddress(url.hostname)) throw new Error('Private or reserved IP targets are blocked');
    return url;
  }
  const resolved = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!resolved.length || resolved.some((entry) => isBlockedAddress(entry.address))) {
    throw new Error('Browser target resolves to a private or reserved network address');
  }
  return url;
}

export class BrowserReadSandbox {
  private queue: Promise<unknown> = Promise.resolve();

  public read(request: BrowserReadRequest): Promise<BrowserReadResult> {
    const run = this.queue.catch(() => undefined).then(() => this.readInternal(request));
    this.queue = run;
    return run;
  }

  private async readInternal(request: BrowserReadRequest): Promise<BrowserReadResult> {
    const target = await assertPublicTarget(request.url);
    const partition = `mio-browser-read-${randomUUID()}`;
    const browserSession = session.fromPartition(partition, { cache: false });
    browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      let protocol = '';
      try { protocol = new URL(details.url).protocol; } catch { callback({ cancel: true }); return; }
      if (details.resourceType !== 'mainFrame' && (protocol === 'data:' || protocol === 'blob:')) {
        callback({ cancel: false });
        return;
      }
      void assertPublicTarget(details.url).then(
        () => callback({ cancel: false }),
        () => callback({ cancel: true }),
      );
    });

    const window = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    browserSession.on('will-download', (event) => event.preventDefault());

    const timer = setTimeout(() => {
      if (!window.isDestroyed()) window.webContents.stop();
    }, LOAD_TIMEOUT_MS);

    try {
      await window.loadURL(target.toString(), { httpReferrer: '' });
      const finalTarget = await assertPublicTarget(window.webContents.getURL());
      const extracted = await window.webContents.executeJavaScript(`(() => {
        const body = document.body;
        const raw = body ? (body.innerText || body.textContent || '') : '';
        return { title: document.title || '', text: raw };
      })()`, true) as { title?: unknown; text?: unknown };
      const rawText = String(extracted.text ?? '').replace(/\u0000/g, '').trim();
      const text = rawText.slice(0, MAX_TEXT_CHARS);
      return {
        title: String(extracted.title ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS),
        url: finalTarget.toString().slice(0, MAX_URL_LENGTH),
        text,
        truncated: rawText.length > text.length,
      };
    } finally {
      clearTimeout(timer);
      if (!window.isDestroyed()) window.destroy();
      await browserSession.clearStorageData().catch(() => undefined);
      await browserSession.clearCache().catch(() => undefined);
    }
  }
}
