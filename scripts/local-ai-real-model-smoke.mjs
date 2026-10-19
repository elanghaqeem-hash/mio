/**
 * Real-model acceptance smoke test (opt-in, NEVER mocked).
 * Requires a running MIO gateway and a locally installed Ollama model.
 * Run: node scripts/local-ai-real-model-smoke.mjs
 */
import assert from 'node:assert/strict';
const endpoint = process.env.MIO_LOCAL_GATEWAY_URL || 'http://127.0.0.1:4318';
const expected = process.env.MIO_LOCAL_MODEL || 'qwen2.5:3b';
const url = new URL(endpoint);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/') {
  throw new Error('Gateway test endpoint must be a loopback HTTP origin without credentials or a path');
}
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 90000);
try {
  const health = await fetch(new URL('/health', url), { signal: controller.signal });
  assert.equal(health.status, 200, 'gateway health request failed');
  const status = await health.json();
  assert.equal(status.status, 'ready', 'local Ollama is not ready');
  assert.equal(status.model, expected, 'wrong configured model');
  assert.equal(status.installed, true, 'model not installed');
  const response = await fetch(new URL('/v1/chat', url), {
    method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'system', content: 'You are MIO, a helpful assistant. Respond with a concise greeting.' }, { role: 'user', content: 'Say hello in Indonesian.' }] }),
  });
  assert.equal(response.status, 200, 'real chat request failed');
  const result = await response.json();
  assert.equal(result.model, expected);
  assert.equal(result.provider, 'local-ollama');
  assert.equal(typeof result.message?.content, 'string');
  assert.ok(result.message.content.trim().length > 0, 'model returned empty text');
  console.log(JSON.stringify({ result: 'PASS', model: result.model, outputChars: result.message.content.length, apiKeysRequired: false }));
} finally {
  clearTimeout(timeout);
}
