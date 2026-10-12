// MIO-PRV-06 S-1: the shared gateway token for /api/ai/generate and /api/research.
// It is entered by the owner on each device, kept out of SystemPreferences (so it is never exported with
// settings or written to provenance/audit), and sent only to same-origin MIO proxy endpoints.
const STORAGE_KEY = 'mio.apiGatewayToken.v1';
export const GATEWAY_TOKEN_HEADER = 'x-mio-gateway-token';
const MAX_TOKEN_LENGTH = 512;

let memoryToken: string | undefined;

const storage = (): Storage | undefined => {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
};

export const apiGatewayCredential = {
  get(): string | undefined {
    if (memoryToken !== undefined) return memoryToken || undefined;
    try { memoryToken = storage()?.getItem(STORAGE_KEY)?.trim() ?? ''; } catch { memoryToken = ''; }
    return memoryToken || undefined;
  },
  set(token: string): void {
    const trimmed = token.trim().slice(0, MAX_TOKEN_LENGTH);
    memoryToken = trimmed;
    try { if (trimmed) storage()?.setItem(STORAGE_KEY, trimmed); else storage()?.removeItem(STORAGE_KEY); } catch { /* memory-only for this session */ }
  },
  clear(): void { this.set(''); },
  isSet(): boolean { return Boolean(this.get()); },
  /** Headers for a request to `endpoint`; the token is attached only when the endpoint is same-origin. */
  headersFor(endpoint: string): Record<string, string> {
    const token = this.get();
    if (!token) return {};
    try {
      const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined;
      const target = new URL(endpoint, base ?? 'http://mio.invalid');
      if (base ? target.origin !== base : target.origin !== 'http://mio.invalid') return {};
    } catch {
      return {};
    }
    return { [GATEWAY_TOKEN_HEADER]: token };
  },
};
