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

function ipv4Bytes(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const bytes = parts.map(Number);
  return bytes.every((value) => value <= 255) ? bytes : null;
}

function isBlockedIpv4Bytes([a, b, c]: number[]): boolean {
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

/** Expands any IPv6 text form (compressed, embedded IPv4, zone id) to 16 bytes, or null when malformed. */
function ipv6Bytes(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0];
  const tail: number[] = [];
  const lastColon = text.lastIndexOf(':');
  if (text.slice(lastColon + 1).includes('.')) {
    const embedded = ipv4Bytes(text.slice(lastColon + 1));
    if (!embedded) return null;
    tail.push(...embedded);
    text = `${text.slice(0, lastColon + 1)}0:0`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    return groups.every((group) => /^[0-9a-f]{1,4}$/.test(group)) ? groups.map((group) => parseInt(group, 16)) : null;
  };
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if (!head || !rest) return null;
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array(missing).fill(0), ...rest];
  const bytes = groups.flatMap((group) => [group >> 8, group & 0xff]);
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function isBlockedIpv6Bytes(bytes: number[]): boolean {
  const zeros = (from: number, to: number) => bytes.slice(from, to).every((value) => value === 0);
  const v4 = (offset: number) => bytes.slice(offset, offset + 4);
  if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return isBlockedIpv4Bytes(v4(12)); // ::ffff:a.b.c.d
  if (zeros(0, 12)) return true; // ::, ::1 and deprecated IPv4-compatible addresses
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) return zeros(4, 12) ? isBlockedIpv4Bytes(v4(12)) : true; // NAT64
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return isBlockedIpv4Bytes(v4(2)); // 6to4
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return true; // Teredo
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true; // documentation
  return (bytes[0] & 0xfe) === 0xfc // unique local
    || (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) // link local
    || (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) // site local
    || bytes[0] === 0xff; // multicast
}

/** Fails closed: anything that is not a well-formed public IPv4/IPv6 address is blocked. */
export function isBlockedAddress(address: string): boolean {
  const unbracketed = address.replace(/^\[(.*)\]$/, '$1');
  const version = isIP(unbracketed);
  if (version === 4) { const bytes = ipv4Bytes(unbracketed); return !bytes || isBlockedIpv4Bytes(bytes); }
  if (version === 6) { const bytes = ipv6Bytes(unbracketed); return !bytes || isBlockedIpv6Bytes(bytes); }
  return true;
}

export function parseHttpsUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_URL_LENGTH) throw new Error('Browser URL is missing or exceeds the bounded length');
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Browser URL is invalid');
  }
  if (url.protocol !== 'https:') throw new Error('MIO browser bridge allows HTTPS targets only');
  if (url.username || url.password) throw new Error('Credentials embedded in browser URLs are not allowed');
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Local/private browser targets are blocked');
  }
  return url;
}

async function assertPublicTarget(raw: unknown): Promise<URL> {
  const url = parseHttpsUrl(raw);
  if (url.hostname.startsWith('[') || isIP(url.hostname)) {
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
