import { resolveMioVoiceSession, voiceSessionRequired, voiceSessionVerificationConfigured, type MioVoiceSessionEnv } from './_session';
import { enforceMioVoiceRateLimit, mioVoiceRateLimitRequired, type MioVoiceRateLimitBinding } from './_rateLimit';

interface Env extends MioVoiceSessionEnv {
  MIO_TTS_ENDPOINT?: string;
  MIO_TTS_API_KEY?: string;
  MIO_TTS_VOICE_ID?: string;
  MIO_TTS_MODEL?: string;
  MIO_TTS_PROVIDER?: string;
  AI?: { run(model: string, input: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown> };
  MIO_VOICE_GATEWAY_TOKEN?: string;
  MIO_VOICE_ALLOWED_ORIGINS?: string;
  MIO_VOICE_REQUIRE_RATE_LIMIT?: string;
  MIO_VOICE_RATE_LIMIT?: MioVoiceRateLimitBinding;
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
const RETRYABLE_UPSTREAM_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_UPSTREAM_ATTEMPTS = 2;
type ProviderKind = 'generic' | 'openai-compatible' | 'cloudflare-workers-ai';

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

function providerKind(env: Env): ProviderKind {
  const kind = env.MIO_TTS_PROVIDER?.trim().toLowerCase();
  if (kind === 'cloudflare-workers-ai') return 'cloudflare-workers-ai';
  return kind === 'openai-compatible' ? 'openai-compatible' : 'generic';
}

const configured = (env: Env) => {
  const kind = providerKind(env);
  if (kind === 'cloudflare-workers-ai') return Boolean(env.AI && env.MIO_TTS_MODEL?.trim());
  return Boolean(
    env.MIO_TTS_ENDPOINT?.trim()
      && env.MIO_TTS_API_KEY?.trim()
      && env.MIO_TTS_VOICE_ID?.trim()
      && (kind === 'generic' || env.MIO_TTS_MODEL?.trim()),
  );
};
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

function providerPayload(env: Env, request: ReturnType<typeof normalize>): Record<string, unknown> {
  if (request instanceof Response) return {};
  if (providerKind(env) === 'openai-compatible') {
    const profile = request.profile;
    const emotion = String(profile.emotion ?? 'warm');
    const instructions = [
      'Speak as Mio with an original, non-imitative vocal identity.',
      'Tone: warm, mature, calm, slightly deep, natural and conversational.',
      `Delivery: ${emotion}; measured pauses; avoid exaggerated acting.`,
      'Do not imitate or reproduce any identifiable performer or reference recording.',
    ].join(' ');
    return {
      model: env.MIO_TTS_MODEL!.trim(),
      voice: env.MIO_TTS_VOICE_ID!.trim(),
      input: request.text,
      instructions,
      response_format: 'mp3',
      speed: Number(profile.speakingRate),
    };
  }
  return {
    text: request.text,
    locale: request.locale,
    voice: env.MIO_TTS_VOICE_ID!.trim(),
    model: env.MIO_TTS_MODEL?.trim() || undefined,
    profile: request.profile,
  };
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

function gatewayReady(env: Env): boolean {
  const kind = providerKind(env);
  const providerReady = configured(env) && (kind === 'cloudflare-workers-ai' || Boolean(safeProviderEndpoint(env)));
  const sessionReady = !voiceSessionRequired(env) || voiceSessionVerificationConfigured(env);
  const rateLimitReady = !mioVoiceRateLimitRequired(env.MIO_VOICE_REQUIRE_RATE_LIMIT) || Boolean(env.MIO_VOICE_RATE_LIMIT);
  return providerReady && sessionReady && rateLimitReady;
}

export function onRequestHead(context: PagesContext): Response {
  return new Response(null, { status: gatewayReady(context.env) ? 204 : 503, headers: securityHeaders() });
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const ready = gatewayReady(context.env);
  return json({
    service: 'mio-voice-v4-synthesis',
    engine: 'v4.7',
    ready,
    provider: providerKind(context.env),
    voiceConfigured: providerKind(context.env) === 'cloudflare-workers-ai'
      ? Boolean(context.env.AI)
      : Boolean(context.env.MIO_TTS_VOICE_ID?.trim()),
    modelConfigured: Boolean(context.env.MIO_TTS_MODEL?.trim()),
    accessProtectionConfigured: Boolean(context.env.MIO_VOICE_GATEWAY_TOKEN?.trim()),
    allowedOriginsConfigured: Boolean(context.env.MIO_VOICE_ALLOWED_ORIGINS?.trim()),
    sessionRequired: voiceSessionRequired(context.env),
    sessionVerificationConfigured: voiceSessionVerificationConfigured(context.env),
    rateLimitRequired: mioVoiceRateLimitRequired(context.env.MIO_VOICE_REQUIRE_RATE_LIMIT),
    rateLimitBindingConfigured: Boolean(context.env.MIO_VOICE_RATE_LIMIT),
    detail: ready ? 'Server-side licensed synthesis gateway is configured.' : 'Production synthesis is not configured; Mio will use its device voice fallback.',
    authority: 'readiness only; no provider secret or voice enrollment data is exposed',
  }, ready ? 200 : 503);
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  if (!requestOriginAllowed(context.request, context.env)) return json({ error: 'This origin is not allowed to request synthesis.' }, 403);
  if (!authorized(context.request, context.env)) return json({ error: 'Synthesis gateway authorization failed.' }, 401);
  const session = await resolveMioVoiceSession(context.request, context.env);
  if (voiceSessionRequired(context.env) && !session) return json({ error: 'Authenticated Mio session is required for synthesis.' }, 401);
  const rateLimit = await enforceMioVoiceRateLimit(context.env.MIO_VOICE_RATE_LIMIT, mioVoiceRateLimitRequired(context.env.MIO_VOICE_REQUIRE_RATE_LIMIT), session?.subject ?? 'anonymous');
  if (rateLimit === 'limited') return json({ error: 'Mio Voice synthesis rate limit exceeded.' }, 429, { 'Retry-After': '60' });
  if (rateLimit === 'unavailable') return json({ error: 'Mio Voice rate-limit enforcement is unavailable.' }, 503);
  const kind = providerKind(context.env);
  const endpoint = safeProviderEndpoint(context.env);
  if (!configured(context.env) || (kind !== 'cloudflare-workers-ai' && !endpoint)) return json({ error: 'Mio production synthesis is not configured on the server.' }, 503);
  if ((context.request.headers.get('content-type') ?? '').split(';')[0].trim() !== 'application/json') return json({ error: 'Content-Type must be application/json' }, 415);

  const body = await readJsonBody(context.request);
  if (body instanceof Response) return body;
  const normalized = normalize(body);
  if (normalized instanceof Response) return normalized;

  if (kind === 'cloudflare-workers-ai') {
    try {
      const model = context.env.MIO_TTS_MODEL!.trim();
      // MeloTTS is the low-cost Cloudflare-hosted option. Cloudflare's public model
      // contract accepts prompt + lang and returns MP3. Locale is deliberately mapped
      // only when known; unsupported locales use device voice rather than silently
      // producing misleading pronunciation.
      const locale = normalized.locale.toLowerCase();
      const langMap: Record<string, string> = {
        'en': 'en', 'en-us': 'en', 'en-gb': 'en',
        'es': 'es', 'es-es': 'es', 'fr': 'fr', 'fr-fr': 'fr',
        'zh': 'zh', 'zh-cn': 'zh', 'ja': 'jp', 'ja-jp': 'jp',
        'ko': 'kr', 'ko-kr': 'kr',
      };
      const lang = langMap[locale];
      if (!lang) return json({
        error: 'Configured Cloudflare TTS model does not have a verified mapping for this locale.',
        locale: normalized.locale,
        fallback: 'device-voice',
      }, 422);
      const result = await context.env.AI!.run(model, { prompt: normalized.text, lang }, { returnRawResponse: true });
      if (result instanceof Response) {
        if (!result.ok) return json({ error: 'Cloudflare Workers AI synthesis failed', upstreamStatus: result.status }, 502);
        if (!result.body) return json({ error: 'Cloudflare Workers AI returned no audio stream' }, 502);
        const contentType = result.headers.get('content-type') ?? 'audio/mpeg';
        return new Response(result.body, {
          status: 200,
          headers: { ...securityHeaders(contentType), 'X-Mio-Voice-Engine': 'v4.7', 'X-Mio-Voice-Provider': 'cloudflare-workers-ai', 'X-Mio-Voice-Streaming': 'workers-ai-binding', ...(session ? { 'X-Mio-Voice-Session': 'authenticated' } : {}) },
        });
      }
      if (result instanceof ReadableStream) return new Response(result, {
        status: 200,
        headers: { ...securityHeaders('audio/mpeg'), 'X-Mio-Voice-Engine': 'v4.7', 'X-Mio-Voice-Provider': 'cloudflare-workers-ai', 'X-Mio-Voice-Streaming': 'workers-ai-binding', ...(session ? { 'X-Mio-Voice-Session': 'authenticated' } : {}) },
      });
      return json({ error: 'Cloudflare Workers AI returned an unsupported synthesis result.' }, 502);
    } catch {
      return json({ error: 'Cloudflare Workers AI synthesis request failed' }, 502);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), UPSTREAM_TIMEOUT_MS);
  const downstreamAbort = () => controller.abort('client-disconnected');
  context.request.signal.addEventListener('abort', downstreamAbort, { once: true });
  try {
    let upstream: Response | null = null;
    for (let attempt = 1; attempt <= MAX_UPSTREAM_ATTEMPTS; attempt += 1) {
      upstream = await fetch(endpoint.toString(), {
        method: 'POST',
        signal: controller.signal,
        redirect: 'error',
        headers: {
          'Authorization': `Bearer ${context.env.MIO_TTS_API_KEY!.trim()}`,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg, audio/wav, audio/ogg',
        },
        body: JSON.stringify(providerPayload(context.env, normalized)),
      });
      if (upstream.ok || !RETRYABLE_UPSTREAM_STATUS.has(upstream.status) || attempt === MAX_UPSTREAM_ATTEMPTS) break;
    }
    if (!upstream?.ok) return json({ error: 'Licensed synthesis provider request failed', upstreamStatus: upstream?.status ?? 502 }, 502);
    if (!upstream.body) return json({ error: 'Licensed synthesis provider returned no audio stream' }, 502);
    const contentType = upstream.headers.get('content-type') ?? 'audio/mpeg';
    if (!/^audio\/(mpeg|wav|x-wav|ogg)(?:;|$)/i.test(contentType)) return json({ error: 'Licensed synthesis provider returned an unsupported media type' }, 502);
    return new Response(upstream.body, {
      status: 200,
      headers: { ...securityHeaders(contentType), 'X-Mio-Voice-Engine': 'v4.7', 'X-Mio-Voice-Streaming': 'upstream-pass-through', ...(session ? { 'X-Mio-Voice-Session': 'authenticated' } : {}) },
    });
  } catch {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      if (reason === 'client-disconnected') return json({ error: 'Synthesis request was cancelled by the client' }, 499);
      return json({ error: 'Synthesis request timed out' }, 504);
    }
    return json({ error: 'Synthesis gateway request failed' }, 502);
  } finally {
    clearTimeout(timeout);
    context.request.signal.removeEventListener('abort', downstreamAbort);
  }
}
