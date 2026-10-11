// Cloudflare Workers AI TTS adapter for the Mio Voice gateway.
// Only models with a verified input/output contract and locale mapping are accepted;
// anything else is treated as unconfigured so the client falls back to device voice.

export interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export const MELOTTS_MODEL = '@cf/myshell-ai/melotts';

// MeloTTS language codes. id-ID is intentionally absent: there is no verified mapping,
// and producing Indonesian text with another language's phonetics would be misleading.
const MELOTTS_LANGS: Record<string, string> = {
  'en': 'en', 'en-us': 'en', 'en-gb': 'en',
  'es': 'es', 'es-es': 'es', 'fr': 'fr', 'fr-fr': 'fr',
  'zh': 'zh', 'zh-cn': 'zh', 'ja': 'jp', 'ja-jp': 'jp',
  'ko': 'kr', 'ko-kr': 'kr',
};

export const workersAiModelSupported = (model: string | undefined): boolean => model?.trim() === MELOTTS_MODEL;

export const workersAiLanguage = (locale: string): string | undefined => MELOTTS_LANGS[locale.toLowerCase()];

export type WorkersAiAudio =
  | { kind: 'audio'; body: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>; contentType: string }
  | { kind: 'error'; status: 502 | 504; error: string; upstreamStatus?: number };

const AUDIO_TYPE = /^audio\/(mpeg|wav|x-wav|ogg)(?:;|$)/i;

const decodeBase64Audio = (value: unknown): Uint8Array<ArrayBuffer> | null => {
  if (typeof value !== 'string' || !value) return null;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
};

/** Normalizes the documented MeloTTS result shapes (raw MP3 stream, raw Response, or `{ audio: base64 }`). */
export async function normalizeWorkersAiResult(result: unknown): Promise<WorkersAiAudio> {
  if (result instanceof Response) {
    if (!result.ok) return { kind: 'error', status: 502, error: 'Cloudflare Workers AI synthesis failed', upstreamStatus: result.status };
    const contentType = result.headers.get('content-type') ?? '';
    if (AUDIO_TYPE.test(contentType)) {
      if (!result.body) return { kind: 'error', status: 502, error: 'Cloudflare Workers AI returned no audio stream' };
      return { kind: 'audio', body: result.body, contentType };
    }
    if (/^application\/json(?:;|$)/i.test(contentType)) {
      return normalizeWorkersAiResult(await result.json().catch(() => null));
    }
    return { kind: 'error', status: 502, error: 'Cloudflare Workers AI returned an unsupported media type' };
  }
  if (result instanceof ReadableStream) return { kind: 'audio', body: result, contentType: 'audio/mpeg' };
  if (result && typeof result === 'object' && 'audio' in result) {
    const bytes = decodeBase64Audio((result as { audio: unknown }).audio);
    if (bytes) return { kind: 'audio', body: bytes, contentType: 'audio/mpeg' };
  }
  return { kind: 'error', status: 502, error: 'Cloudflare Workers AI returned an unsupported synthesis result.' };
}

/** Runs MeloTTS with a hard timeout. The binding has no abort signal, so the race bounds gateway latency. */
export async function synthesizeWithWorkersAi(ai: WorkersAiBinding, model: string, text: string, lang: string, timeoutMs: number): Promise<WorkersAiAudio> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<WorkersAiAudio>(resolve => {
    timer = setTimeout(() => resolve({ kind: 'error', status: 504, error: 'Synthesis request timed out' }), timeoutMs);
  });
  try {
    const run = ai.run(model, { prompt: text, lang }, { returnRawResponse: true })
      .then(normalizeWorkersAiResult, () => ({ kind: 'error', status: 502, error: 'Cloudflare Workers AI synthesis request failed' }) as WorkersAiAudio);
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
