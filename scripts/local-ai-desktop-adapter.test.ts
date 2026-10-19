import assert from 'node:assert/strict';
import { createLocalInferenceBackend } from '../src/intelligence/model/LocalInferenceBackend';

async function main(): Promise<void> {
const originalFetch = globalThis.fetch;
const backend = createLocalInferenceBackend('gateway', 'http://127.0.0.1:4318', 'qwen2.5:3b');
let calls = 0;
try {
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = String(input);
    if (url.endsWith('/health')) {
      return new Response(JSON.stringify({ status: 'ready', installed: true, model: 'qwen2.5:3b' }), { status: 200 });
    }
    assert.ok(url.endsWith('/v1/chat'));
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.messages, [{ role: 'user', content: 'Halo' }]);
    return new Response(JSON.stringify({ model: 'qwen2.5:3b', message: { content: '  Halo dari MIO!  ' } }), { status: 200 });
  };
  assert.equal((await backend.checkReadiness()).ready, true);
  const result = await backend.chat([{ role: 'user', content: 'Halo' }], { messages: [] });
  assert.equal(result.text, 'Halo dari MIO!');
  assert.equal(result.model, 'qwen2.5:3b');
  assert.equal(calls, 2);

  globalThis.fetch = async () => new Response(JSON.stringify({ model: 'untrusted:1b', message: { content: 'bad alias' } }), { status: 200 });
  await assert.rejects(backend.chat([{ role: 'user', content: 'Halo' }], { messages: [] }), /identity mismatch/);

  globalThis.fetch = async (_url, init) => await new Promise((_resolve, reject) => {
    if (init?.signal?.aborted) return reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
  });
  const controller = new AbortController();
  const pending = backend.chat([{ role: 'user', content: 'Halo' }], { messages: [] }, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });

  assert.throws(() => createLocalInferenceBackend('gateway', 'https://remote.example:4318', 'qwen2.5:3b'), /loopback/);
  console.log('MIO desktop local backend contract passed');
} finally {
  globalThis.fetch = originalFetch;
}

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
