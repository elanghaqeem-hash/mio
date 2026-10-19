import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMioLocalGateway } from './local-ai-gateway.mjs';

const realFetch = globalThis.fetch;
let upstreamCalls = 0;
let aborted = false;
let simulateMissingModel = false;
let simulateUnavailableBackend = false;
let simulateMalformedBackend = false;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (simulateUnavailableBackend) throw new Error('Ollama service unavailable');
  if (url === 'http://127.0.0.1:11434/api/tags') {
    return new Response(JSON.stringify({ models: simulateMissingModel ? [] : [{ name: 'qwen2.5:3b' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'http://127.0.0.1:11434/api/chat') {
    upstreamCalls++;
    if (simulateMalformedBackend) return new Response('{invalid-json', { status: 200 });
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'qwen2.5:3b');
    assert.equal(body.stream, false);
    if (body.messages[0]?.content === 'SLOW_CANCEL') {
      return await new Promise((resolve, reject) => {
        const cancel = () => { aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); };
        if (init.signal?.aborted) return cancel();
        init.signal?.addEventListener('abort', cancel, { once: true });
      });
    }
    return new Response(JSON.stringify({ message: { content: 'Halo! Saya MIO lokal.' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('Unexpected upstream fetch: ' + url);
};

const server = createMioLocalGateway();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const health = await realFetch(base + '/health');
  assert.equal(health.status, 200);
  const h = await health.json();
  assert.equal(h.status, 'ready');
  assert.equal(h.installed, true);

  const response = await realFetch(base + '/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Halo' }] }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const result = await response.json();
  assert.equal(result.model, 'qwen2.5:3b');
  assert.equal(result.message.content, 'Halo! Saya MIO lokal.');
  assert.equal(upstreamCalls, 1);

  simulateMissingModel = true;
  const missingHealth = await realFetch(base + '/health');
  assert.equal(missingHealth.status, 200);
  const missingStatus = await missingHealth.json();
  assert.equal(missingStatus.status, 'model_missing');
  assert.equal(missingStatus.installed, false);
  simulateMissingModel = false;

  simulateUnavailableBackend = true;
  const unavailableHealth = await realFetch(base + '/health');
  assert.equal(unavailableHealth.status, 503);
  const unavailableError = await unavailableHealth.json();
  assert.match(unavailableError.error, /Local model unavailable/);
  simulateUnavailableBackend = false;

  simulateMalformedBackend = true;
  const malformed = await realFetch(base + '/v1/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Malformed response' }] }),
  });
  assert.equal(malformed.status, 503);
  const malformedBody = await malformed.json();
  assert.match(malformedBody.error, /Local model unavailable/);
  simulateMalformedBackend = false;

  const controller = new AbortController();
  const pending = realFetch(base + '/v1/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'SLOW_CANCEL' }] }),
    signal: controller.signal,
  });
  // Wait until mock upstream sees the chat request; bounded polling.
  for (let i = 0; i < 80 && upstreamCalls < 3; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(upstreamCalls, 3, 'slow request must reach local inference');
  controller.abort();
  await assert.rejects(pending, e => e.name === 'AbortError');
  for (let i = 0; i < 80 && !aborted; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(aborted, true, 'upstream model fetch should abort on client disconnect');
  console.log('MIO gateway mocked inference and abort contract passed');
} finally {
  globalThis.fetch = realFetch;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
