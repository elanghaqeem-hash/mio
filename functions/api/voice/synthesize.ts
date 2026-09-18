interface Env {
  MIO_TTS_ENDPOINT?: string;
  MIO_TTS_API_KEY?: string;
  MIO_TTS_VOICE_ID?: string;
  MIO_TTS_MODEL?: string;
  MIO_VOICE_GATEWAY_TOKEN?: string;
  MIO_VOICE_ALLOWED_ORIGINS?: string;
}

interface PagesContext { request: Request; env: Env; }
interface SynthesisProfile {
  id?: string; speakingRate?: number; pitchSemitones?: number; warmth?: number;
  expressiveness?: number; breathiness?: number; pauseScale?: number; emotion?: string;
}
interface SynthesisRequest { text?: string; locale?: string; profile?: SynthesisProfile; }

const MAX_TEXT_CHARS = 8000;
const MAX_BODY_BYTES = 32_000;
const UPSTREAM_TIMEOUT_MS = 30_000;
const ALLOWED_EMOTIONS = new Set(['neutral', 'warm', 'confident', 'gentle', 'focused', 'playful']);

function securityHeaders(contentType?: string): HeadersInit {
  return {
    ...(contentType ? { 'Content-Type': contentType } : {}),
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'microphone=(), camera=()',
  };
}

const json = (payload: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { ...securityHeaders('application/json; charset=utf-8'), ...extra } });

const configured = (env: Env) => Boolean(env.MIO_TTS_ENDPOINT?.trim() && env.MIO_TTS_API_KEY?.trim() && env.MIO_TTS_VOICE_ID?.trim());
const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

function normalize(body: SynthesisRequest): Required<Pick<SynthesisRequest, 'text' | 'locale'>> & { profile: Record<string, string | number> } | Response {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > MAX_TEXT_CHARS) return json({ error: `text must contain 1-${MAX_TEXT_CHARS} characters` }, 400);
  const locale = typeof body.locale === 'string' && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(body.locale) ? body.locale : 'id-ID';
  const source = body.profile ?? {};
  const emotion = typeof source.emotion === 'string' && ALLOWED_EMOTIONS.has(source.emotion) ? source.emotion : 'warm';
  return { text, locale, profile: {
    // Provider voice/model identity is server-owned. Client profile IDs are descriptive only.
    id: 'mio-v4-warm-deep',
    speakingRate: clamp(source.speakingRate, 0.98, 0.75, 1.25),
    pitchSemitones: clamp(source.pitchSemitones, -1.7, -4, 2),
    warmth: clamp(source.warmth, 0.68, 0, 1),
    expressiveness: clamp(source.expressiveness, 0.62, 0, 1),
    breathiness: clamp(source.breathiness, 0.12, 0, 0.5),
    pauseScale: clamp(source.pauseScale, 1.05, 0.75, 1.5),
    emotion,
  } };
}

function requestOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  let normalizedOrigin: string;
  try { normalizedOrigin = new URL(origin).origin; } catch { return false; }
  if (normalizedOrigin === new URL(request.url).origin) return true;
  const allowed = (env.MIO_VOICE_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  return allowed.some(value => {
    try { return new URL(value).origin === normalizedOrigin; } catch { return false; }
  });
}

function authorized(request: Request, env: Env): boolean {
  const expected = env.MIO_VOICE_GATEWAY_TOKEN?.trim();
  if (!expected) return true;
  const supplied = request.headers.get('x-mio-voice-token')?.trim();
  return Boolean(supplied && supplied === expected);
}

function safeProviderEndpoint(env: Env): URL | null {
  const raw = env.MIO_TTS_ENDPOINT?.trim();
  if (!raw) return null;
  try {
    const endpoint = new URL(raw);
    if (endpoint.protocol !== 'https:') return null;
    // Prevent accidental loopback/private-host routing from deployment configuration.
    const host = endpoint.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return null;
    return endpoint;
  } catch { return null; }
}

async function readJsonBody(request: Request): Promise<SynthesisRequest | Response> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ error: 'Synthesis request body is too large.' }, 413);
  if (!request.body) return json({ error: 'Request body is required.' }, 400);

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel('body-too-large');
        return json({ error: 'Synthesis request body is too large.' }, 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as SynthesisRequest;
  } catch {
    return json({ error: 'Invalid JSON request body' }, 400);
  } finally {
    reader.releaseLock();
  }
}

export function onRequestHead(context: PagesContext): Response {
  return new Response(null, { status: configured(context.env) && safeProviderEndpoint(context.env) ? 204 : 503, headers: securityHeaders() });
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const ready = configured(context.env) && Boolean(safeProviderEndpoint(context.env));
  return json({
    service: 'mio-voice-v4-synthesis',
    engine: 'v4.2',
    ready,
    voiceConfigured: Boolean(context.env.MIO_TTS_VOICE_ID?.trim()),
    modelConfigured: Boolean(context.env.MIO_TTS_MODEL?.trim()),
    accessProtectionConfigured: Boolean(context.env.MIO_VOICE_GATEWAY_TOKEN?.trim()),
    allowedOriginsConfigured: Boolean(context.env.MIO_VOICE_ALLOWED_ORIGINS?.trim()),
    detail: ready ? 'Server-side licensed synthesis gateway is configured.' : 'Production synthesis is not configured; Mio will use its device voice fallback.',
    authority: 'readiness only; no provider secret or voice enrollment data is exposed',
  }, ready ? 200 : 503);
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  if (!requestOriginAllowed(context.request, context.env)) return json({ error: 'This origin is not allowed to request synthesis.' }, 403);
  if (!authorized(context.request, context.env)) return json({ error: 'Synthesis gateway authorization failed.' }, 401);
  const endpoint = safeProviderEndpoint(context.env);
  if (!configured(context.env) || !endpoint) return json({ error: 'Mio production synthesis is not configured on the server.' }, 503);
  if ((context.request.headers.get('content-type') ?? '').split(';')[0].trim() !== 'application/json') return json({ error: 'Content-Type must be application/json' }, 415);

  const body = await readJsonBody(context.request);
  if (body instanceof Response) return body;
  const normalized = normalize(body);
  if (normalized instanceof Response) return normalized;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), UPSTREAM_TIMEOUT_MS);
  const downstreamAbort = () => controller.abort('client-disconnected');
  context.request.signal.addEventListener('abort', downstreamAbort, { once: true });
  try {
    const upstream = await fetch(endpoint.toString(), {
      method: 'POST',
      signal: controller.signal,
      redirect: 'error',
      headers: {
        'Authorization': `Bearer ${context.env.MIO_TTS_API_KEY!.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg, audio/wav, audio/ogg',
      },
      body: JSON.stringify({
        text: normalized.text,
        locale: normalized.locale,
        voice: context.env.MIO_TTS_VOICE_ID!.trim(),
        model: context.env.MIO_TTS_MODEL?.trim() || undefined,
        profile: normalized.profile,
      }),
    });
    if (!upstream.ok) return json({ error: 'Licensed synthesis provider request failed', upstreamStatus: upstream.status }, 502);
    if (!upstream.body) return json({ error: 'Licensed synthesis provider returned no audio stream' }, 502);
    const contentType = upstream.headers.get('content-type') ?? 'audio/mpeg';
    if (!/^audio\/(mpeg|wav|x-wav|ogg)(?:;|$)/i.test(contentType)) return json({ error: 'Licensed synthesis provider returned an unsupported media type' }, 502);
    return new Response(upstream.body, {
      status: 200,
      headers: { ...securityHeaders(contentType), 'X-Mio-Voice-Engine': 'v4.2', 'X-Mio-Voice-Streaming': 'upstream-pass-through' },
    });
  } catch {
    const aborted = controller.signal.aborted;
    return json({ error: aborted ? 'Synthesis request timed out or was cancelled' : 'Synthesis gateway request failed' }, aborted ? 504 : 502);
  } finally {
    clearTimeout(timeout);
    context.request.signal.removeEventListener('abort', downstreamAbort);
  }
}
