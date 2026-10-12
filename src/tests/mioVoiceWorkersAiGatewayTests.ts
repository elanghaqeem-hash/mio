import { onRequestGet, onRequestPost } from '../../functions/api/voice/synthesize';
import { MELOTTS_MODEL, normalizeWorkersAiResult, synthesizeWithWorkersAi, workersAiLanguage, workersAiModelSupported, type WorkersAiBinding } from '../../functions/api/voice/_workersAi';

const assert = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
const base64Mp3 = btoa(String.fromCharCode(...mp3));
const binding = (run: WorkersAiBinding['run']): WorkersAiBinding => ({ run });
const env = (ai?: WorkersAiBinding, model = MELOTTS_MODEL) => ({ MIO_TTS_PROVIDER: 'cloudflare-workers-ai', MIO_TTS_MODEL: model, AI: ai });
const post = (locale: string) => new Request('https://mio.test/api/voice/synthesize', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: 'Hello from Mio', locale }),
});
const readiness = async (environment: ReturnType<typeof env>) => (await (await onRequestGet({ request: new Request('https://mio.test/api/voice/synthesize'), env: environment })).json()) as { ready: boolean; provider: string };

export async function runMioVoiceWorkersAiGatewayTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['only the verified MeloTTS model is accepted', async () => {
      assert(workersAiModelSupported(MELOTTS_MODEL) && workersAiModelSupported(` ${MELOTTS_MODEL} `), 'MeloTTS rejected');
      assert(!workersAiModelSupported('@cf/other/tts') && !workersAiModelSupported(undefined), 'unverified model accepted');
    }],
    ['readiness requires both the AI binding and a verified model', async () => {
      const ai = binding(async () => mp3);
      assert((await readiness(env(ai))).ready, 'configured gateway not ready');
      assert((await readiness(env(ai))).provider === 'cloudflare-workers-ai', 'provider not reported');
      assert(!(await readiness(env(undefined))).ready, 'ready without AI binding');
      assert(!(await readiness(env(ai, '@cf/other/tts'))).ready, 'ready with unverified model');
    }],
    ['Indonesian (id-ID) falls back to device voice without calling the model', async () => {
      let called = false;
      const response = await onRequestPost({ request: post('id-ID'), env: env(binding(async () => { called = true; return mp3; })) });
      const payload = await response.json() as { fallback?: string };
      assert(response.status === 422 && payload.fallback === 'device-voice', 'id-ID did not fall back');
      assert(!called && workersAiLanguage('id-ID') === undefined, 'model called for unmapped locale');
    }],
    ['base64 JSON result is decoded into MP3 audio', async () => {
      let input: Record<string, unknown> = {};
      const response = await onRequestPost({ request: post('en-US'), env: env(binding(async (_model, received) => { input = received; return { audio: base64Mp3 }; })) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert(response.status === 200 && response.headers.get('content-type') === 'audio/mpeg', 'audio response missing');
      assert(bytes.length === mp3.length && bytes.every((value, index) => value === mp3[index]), 'decoded audio mismatch');
      assert(input.lang === 'en' && input.prompt === 'Hello from Mio', 'MeloTTS input mapping wrong');
      assert(response.headers.get('X-Mio-Voice-Provider') === 'cloudflare-workers-ai', 'provider header missing');
    }],
    ['raw audio Response streams through; non-audio Response is rejected', async () => {
      const audio = await normalizeWorkersAiResult(new Response(mp3, { headers: { 'content-type': 'audio/mpeg' } }));
      assert(audio.kind === 'audio' && audio.contentType === 'audio/mpeg', 'raw audio not passed through');
      const html = await normalizeWorkersAiResult(new Response('<html>', { headers: { 'content-type': 'text/html' } }));
      assert(html.kind === 'error' && html.status === 502, 'non-audio media type accepted');
      const json = await normalizeWorkersAiResult(new Response(JSON.stringify({ audio: base64Mp3 }), { headers: { 'content-type': 'application/json' } }));
      assert(json.kind === 'audio', 'JSON Response with base64 audio not decoded');
    }],
    ['upstream failures fail closed with 502', async () => {
      const failed = await normalizeWorkersAiResult(new Response('busy', { status: 503 }));
      assert(failed.kind === 'error' && failed.status === 502 && failed.upstreamStatus === 503, 'upstream status not surfaced');
      assert((await normalizeWorkersAiResult({ audio: '' })).kind === 'error', 'empty audio accepted');
      assert((await normalizeWorkersAiResult({ audio: '%%%not-base64' })).kind === 'error', 'invalid base64 accepted');
      const thrown = await onRequestPost({ request: post('en-US'), env: env(binding(async () => { throw new Error('quota exceeded: secret-detail'); })) });
      const text = await thrown.text();
      assert(thrown.status === 502 && !text.includes('secret-detail'), 'binding error leaked or wrong status');
    }],
    ['a synchronous binding throw maps to 502, and a late stream after timeout is cancelled', async () => {
      const thrown = await synthesizeWithWorkersAi(binding(() => { throw new Error('bad input'); }), MELOTTS_MODEL, 'hi', 'en', 1000);
      assert(thrown.kind === 'error' && thrown.status === 502, 'synchronous throw was not mapped to 502');
      let cancelled = false;
      const late = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
      const slow = await synthesizeWithWorkersAi(binding(() => new Promise(resolve => setTimeout(() => resolve(late), 30))), MELOTTS_MODEL, 'hi', 'en', 5);
      await new Promise(resolve => setTimeout(resolve, 60));
      assert(slow.kind === 'error' && slow.status === 504 && cancelled, 'late stream after timeout was not cancelled');
    }],
    ['a hung model call times out with 504', async () => {
      const hung = await synthesizeWithWorkersAi(binding(() => new Promise(() => undefined)), MELOTTS_MODEL, 'hi', 'en', 20);
      assert(hung.kind === 'error' && hung.status === 504, 'hung call did not time out');
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log(`✓ [PASS] ${name}`); }
  return { passed, total: tests.length };
}
