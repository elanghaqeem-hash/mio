/**
 * LAR-19: Real local inference cancellation acceptance.
 * Requires live Ollama + MIO gateway. Does NOT test the desktop STOP button.
 * Run: node scripts/local-ai-real-cancellation-smoke.mjs
 */
import assert from 'node:assert/strict';

const base = new URL(process.env.MIO_LOCAL_GATEWAY_URL || 'http://127.0.0.1:4318');
if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) ||
    base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('Only a loopback HTTP gateway origin is permitted');
}
const model = process.env.MIO_LOCAL_MODEL || 'qwen2.5:3b';
const healthController = new AbortController();
const healthTimer = setTimeout(() => healthController.abort(), 10000);
try {
  const healthResponse = await fetch(new URL('/health', base), { signal: healthController.signal });
  assert.equal(healthResponse.status, 200, 'Gateway health failed');
  const health = await healthResponse.json();
  assert.equal(health.status, 'ready', 'Local model not ready');
  assert.equal(health.model, model, 'Configured model mismatch');
} finally {
  clearTimeout(healthTimer);
}

const controller = new AbortController();
const started = Date.now();
let cancelObserved = false;
let abortSource;
const kill = setTimeout(() => { abortSource = 'intentional-cancel'; controller.abort(); }, 500);
const watchdog = setTimeout(() => { if (!controller.signal.aborted) { abortSource = 'watchdog-timeout'; controller.abort(); } }, 15000);
try {
  const request = await fetch(new URL('/v1/chat', base), {
    method: 'POST',
    signal: controller.signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [
      { role: 'system', content: 'Generate a very long numbered list of 500 detailed points without stopping.' },
      { role: 'user', content: 'Start the list and continue.' },
    ] }),
  });
  if (!request.ok) throw new Error('Gateway returned HTTP ' + request.status);
  await request.text();
  // Fast local models can finish before the intentional cancellation.
  console.log(JSON.stringify({ result: 'INCONCLUSIVE', reason: 'Generation finished before cancellation', elapsedMs: Date.now() - started }));
  process.exitCode = 2;
} catch (error) {
  if (controller.signal.aborted && abortSource === 'intentional-cancel' && error?.name === 'AbortError') {
    cancelObserved = true;
  } else if (abortSource === 'watchdog-timeout') {
    throw new Error('Request exceeded watchdog timeout; cancellation is NOT verified');
  } else {
    throw error;
  }
} finally {
  clearTimeout(kill);
  clearTimeout(watchdog);
}
if (cancelObserved) console.log(JSON.stringify({ result: 'PASS_CLIENT_ABORT', model, elapsedMs: Date.now() - started, note: 'Desktop STOP UI and upstream termination require separate verification.' }));
