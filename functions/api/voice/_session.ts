export interface MioVoiceSession {
  id: string;
  subject: string;
  expiresAt?: number;
}

export interface MioVoiceSessionEnv {
  MIO_VOICE_REQUIRE_SESSION?: string;
  MIO_CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  MIO_CLOUDFLARE_ACCESS_AUD?: string;
  MIO_VOICE_TRUSTED_SUBJECT_TOKEN?: string;
}

interface AccessJwtHeader {
  alg?: string;
  kid?: string;
}

interface AccessJwtPayload {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
  nbf?: number;
  sub?: string;
}

interface AccessJwk extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

interface AccessJwks {
  keys?: AccessJwk[];
}

interface CachedJwks {
  expiresAt: number;
  keys: AccessJwk[];
}

const JWT_CLOCK_SKEW_SECONDS = 30;
const JWKS_CACHE_MS = 5 * 60 * 1000;
const jwksCache = new Map<string, CachedJwks>();

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJson<T>(value: string): T | null {
  try {
    const bytes = decodeBase64Url(value);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function normalizeOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function audienceMatches(payloadAud: AccessJwtPayload['aud'], expected: string): boolean {
  if (typeof payloadAud === 'string') return payloadAud === expected;
  return Array.isArray(payloadAud) && payloadAud.includes(expected);
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const size = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let index = 0; index < size; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}

async function getAccessJwks(issuer: string): Promise<AccessJwk[]> {
  const now = Date.now();
  const cached = jwksCache.get(issuer);
  if (cached && cached.expiresAt > now) return cached.keys;

  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
    method: 'GET',
    redirect: 'error',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Cloudflare Access JWKS request failed.');

  const body = await response.json() as AccessJwks;
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (keys.length === 0) throw new Error('Cloudflare Access JWKS contains no signing keys.');

  jwksCache.set(issuer, { expiresAt: now + JWKS_CACHE_MS, keys });
  return keys;
}

async function verifyCloudflareAccessSession(
  request: Request,
  env: MioVoiceSessionEnv,
): Promise<MioVoiceSession | null> {
  const issuer = normalizeOrigin(env.MIO_CLOUDFLARE_ACCESS_TEAM_DOMAIN);
  const audience = env.MIO_CLOUDFLARE_ACCESS_AUD?.trim();
  if (!issuer || !audience) return null;

  const token = request.headers.get('cf-access-jwt-assertion')?.trim();
  if (!token) return null;

  const segments = token.split('.');
  if (segments.length !== 3) return null;

  const header = decodeJson<AccessJwtHeader>(segments[0]);
  const payload = decodeJson<AccessJwtPayload>(segments[1]);
  if (!header || !payload || header.alg !== 'RS256' || !header.kid) return null;

  const normalizedPayloadIssuer = normalizeOrigin(payload.iss);
  if (!normalizedPayloadIssuer || normalizedPayloadIssuer !== issuer) return null;
  if (!audienceMatches(payload.aud, audience)) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds - JWT_CLOCK_SKEW_SECONDS) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds + JWT_CLOCK_SKEW_SECONDS) return null;

  try {
    const keys = await getAccessJwks(issuer);
    const jwk = keys.find(candidate => candidate.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signed = new TextEncoder().encode(`${segments[0]}.${segments[1]}`);
    const signature = decodeBase64Url(segments[2]);
    const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed);
    if (!verified) return null;
  } catch {
    return null;
  }

  const subject = payload.email?.trim() || payload.sub?.trim();
  if (!subject) return null;

  return {
    id: (payload.sub?.trim() || request.headers.get('cf-ray')?.trim() || 'cf-access-session').slice(0, 160),
    subject: subject.slice(0, 320),
    expiresAt: payload.exp * 1000,
  };
}

function resolveTrustedMiddlewareSession(
  request: Request,
  env: MioVoiceSessionEnv,
): MioVoiceSession | null {
  const expectedProof = env.MIO_VOICE_TRUSTED_SUBJECT_TOKEN?.trim();
  const subject = request.headers.get('x-mio-authenticated-subject')?.trim();
  const suppliedProof = request.headers.get('x-mio-authenticated-subject-token')?.trim();
  if (!expectedProof || !subject || !suppliedProof || !constantTimeEqual(suppliedProof, expectedProof)) return null;

  const sessionId = request.headers.get('x-mio-session-id')?.trim()
    || request.headers.get('cf-ray')?.trim()
    || 'trusted-middleware-session';

  return {
    id: sessionId.slice(0, 160),
    subject: subject.slice(0, 320),
  };
}

/**
 * Voice V4.4 authenticated-session boundary.
 *
 * Cloudflare Access identity is accepted only after the Access JWT signature,
 * issuer, audience and lifetime are verified. A custom Mio subject header is
 * accepted only when trusted server middleware also injects a deployment
 * secret proof that is never exposed to browser code.
 */
export async function resolveMioVoiceSession(
  request: Request,
  env: MioVoiceSessionEnv,
): Promise<MioVoiceSession | null> {
  const cloudflareSession = await verifyCloudflareAccessSession(request, env);
  if (cloudflareSession) return cloudflareSession;
  return resolveTrustedMiddlewareSession(request, env);
}

export function voiceSessionRequired(env: MioVoiceSessionEnv): boolean {
  return env.MIO_VOICE_REQUIRE_SESSION?.trim().toLowerCase() === 'true';
}

export function voiceSessionVerificationConfigured(env: MioVoiceSessionEnv): boolean {
  const accessConfigured = Boolean(
    normalizeOrigin(env.MIO_CLOUDFLARE_ACCESS_TEAM_DOMAIN)
      && env.MIO_CLOUDFLARE_ACCESS_AUD?.trim(),
  );
  const middlewareConfigured = Boolean(env.MIO_VOICE_TRUSTED_SUBJECT_TOKEN?.trim());
  return accessConfigured || middlewareConfigured;
}
