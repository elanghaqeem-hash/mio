// MIO-PRV-06: shared request hardening for Pages Functions (not a route: underscore-prefixed module).

export type BoundedJsonResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 413; error: string };

/**
 * Reads a JSON body without ever buffering more than `maxBytes`. A declared Content-Length above the limit is
 * rejected before reading, and a chunked body is cut off as soon as it crosses the limit.
 */
export async function readBoundedJson<T>(request: Request, maxBytes: number): Promise<BoundedJsonResult<T>> {
  const tooLarge = { ok: false, status: 413, error: 'Request body is too large' } as const;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge;
  if (!request.body) return { ok: false, status: 400, error: 'Invalid JSON request body' };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel('body-too-large').catch(() => undefined);
        return tooLarge;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON request body' };
  } finally {
    reader.releaseLock();
  }
}

// Keep in sync with SECRET_VALUE_PATTERNS in src/security/SecretRedaction.ts (a regression test compares them).
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b(x-api-key|x-goog-api-key|api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|password)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

/** Removes credential-shaped substrings from text that may echo upstream responses or errors. */
export function redactSecretText(text: string): string {
  return SECRET_VALUE_PATTERNS.reduce((current, pattern) => current.replace(pattern, (match, name?: string, separator?: string) => (
    typeof name === 'string' && typeof separator === 'string' ? `${name}${separator}[REDACTED]` : /^bearer/i.test(match) ? 'Bearer [REDACTED]' : '[REDACTED]'
  )), text);
}

// MIO-PRV-06 S-1 (owner decision: shared gateway token). The token lives only in the Cloudflare Pages
// environment and on the owner's devices (entered in Settings); it is never part of the web bundle.
export const GATEWAY_TOKEN_HEADER = 'x-mio-gateway-token';
const MIN_GATEWAY_TOKEN_LENGTH = 32;

export interface GatewayTokenEnv {
  MIO_API_GATEWAY_TOKEN?: string;
  MIO_API_REQUIRE_GATEWAY_TOKEN?: string;
}

export type GatewayProtection = 'TOKEN' | 'UNPROTECTED' | 'MISCONFIGURED';

/** TOKEN when a strong token is set; MISCONFIGURED when protection is required or set but unusable; UNPROTECTED otherwise. */
export function gatewayProtection(env: GatewayTokenEnv): GatewayProtection {
  const token = env.MIO_API_GATEWAY_TOKEN?.trim();
  if (token) return token.length >= MIN_GATEWAY_TOKEN_LENGTH ? 'TOKEN' : 'MISCONFIGURED';
  return env.MIO_API_REQUIRE_GATEWAY_TOKEN?.trim().toLowerCase() === 'true' ? 'MISCONFIGURED' : 'UNPROTECTED';
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}

/** Whether the request carries the configured gateway token. Always true for an UNPROTECTED (transitional) deployment. */
export function gatewayTokenAccepted(request: Request, env: GatewayTokenEnv): boolean {
  const protection = gatewayProtection(env);
  if (protection === 'UNPROTECTED') return true;
  if (protection === 'MISCONFIGURED') return false;
  const supplied = request.headers.get(GATEWAY_TOKEN_HEADER)?.trim();
  return Boolean(supplied && constantTimeEqual(supplied, env.MIO_API_GATEWAY_TOKEN!.trim()));
}

/** Fails closed before any body is read or any upstream is called: 503 when misconfigured, 401 without a valid token. */
export function rejectUnauthorizedGatewayRequest(request: Request, env: GatewayTokenEnv): { status: 401 | 503; error: string } | null {
  const protection = gatewayProtection(env);
  if (protection === 'MISCONFIGURED') return { status: 503, error: `Gateway protection is required but MIO_API_GATEWAY_TOKEN is missing or shorter than ${MIN_GATEWAY_TOKEN_LENGTH} characters` };
  if (!gatewayTokenAccepted(request, env)) return { status: 401, error: 'A valid MIO gateway token is required. Enter it in Settings → Secure proxy access.' };
  return null;
}
