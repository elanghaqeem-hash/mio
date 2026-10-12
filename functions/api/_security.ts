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
