/**
 * MIO local inference gateway. Node 20+; zero third-party dependencies.
 * Listens on loopback ONLY, never exposes Ollama directly to the internet.
 * Start: node scripts/local-ai-gateway.mjs
 * Health: curl http://127.0.0.1:4318/health
 * Chat: POST /v1/chat {messages:[{role:"user",content:"Halo"}]}
 */
import http from 'node:http';

const HOST = '127.0.0.1';
const PORT = Number(process.env.MIO_LOCAL_PORT || 4318);
const MODEL = process.env.MIO_LOCAL_MODEL || 'qwen2.5:3b';
const TIMEOUT_MS = Math.min(Math.max(Number(process.env.MIO_LOCAL_TIMEOUT_MS || 60000), 1000), 180000);
const MAX_BYTES = 64 * 1024;
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant']);
const UPSTREAM = 'http://127.0.0.1:11434';

function reply(res, code, obj, origin) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(origin ? { 'access-control-allow-origin': origin } : {}), 'vary': 'Origin' });
  res.end(JSON.stringify(obj));
}
async function ollama(path, body, clientSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const cancel = () => controller.abort();
  clientSignal?.addEventListener('abort', cancel, { once: true });
  if (clientSignal?.aborted) controller.abort();
  try {
    const response = await fetch(UPSTREAM + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Local inference backend returned HTTP ' + response.status);
    return await response.json();
  } finally { clearTimeout(timer); clientSignal?.removeEventListener('abort', cancel); }
}
export function createMioLocalGateway() {
  return http.createServer(async (req, res) => {
    // Reject ambiguous duplicate Host headers before any routing.
    if (req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host').length !== 1) {
      return reply(res, 400, { error: 'Invalid Host headers' });
    }
    const host = req.headers.host || '';
    const localPort = res.socket?.localPort;
    // Reject DNS-rebinding and unexpected Host headers even for non-browser callers.
    if (!/^((127\.0\.0\.1)|(localhost)):[0-9]{1,5}$/.test(host) || !Number.isInteger(localPort) || Number(host.slice(host.lastIndexOf(':') + 1)) !== localPort) {
      return reply(res, 403, { error: 'Host not allowed' });
    }
    const origin = req.headers.origin;
    const respond = (status, body) => reply(res, status, body, origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173' ? origin : undefined);
    // Browser callers must come from the local dev application; no wildcard CORS.
    if (origin && origin !== 'http://localhost:5173' && origin !== 'http://127.0.0.1:5173') {
      return respond( 403, { error: 'Origin not allowed' });
    }
    if (req.method === 'OPTIONS') {
      // Only explicitly trusted development origins receive preflight permission.
      if (!origin) return respond(403, { error: 'Origin required for preflight' });
      res.writeHead(204, {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'vary': 'Origin',
        'cache-control': 'no-store',
      });
      return res.end();
    }
    try {
      if (req.url === '/health' && req.method === 'GET') {
        const tags = await ollama('/api/tags');
        const models = (tags.models || []).map(m => m.name);
        return respond( 200, { status: models.includes(MODEL) ? 'ready' : 'model_missing', provider: 'local-ollama', model: MODEL, installed: models.includes(MODEL) });
      }
      if (req.url === '/v1/chat' && req.method === 'POST') {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BYTES) return respond( 413, { error: 'Payload too large' });
          chunks.push(chunk);
        }
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return respond( 400, { error: 'Invalid JSON' }); }
        if (!Array.isArray(data.messages) || data.messages.length < 1 || data.messages.length > 32 ||
            !data.messages.every(m => m && ALLOWED_ROLES.has(m.role) && typeof m.content === 'string' && m.content.length <= 16000)) {
          return respond( 400, { error: 'Invalid messages' });
        }
        const inferenceAbort = new AbortController();
        const onClose = () => { if (!res.writableFinished) inferenceAbort.abort(); };
        res.once('close', onClose);
        let output;
        try {
          output = await ollama('/api/chat', { model: MODEL, messages: data.messages, stream: false, options: { num_predict: 1024 } }, inferenceAbort.signal);
        } finally {
          res.removeListener('close', onClose);
        }
        if (typeof output?.message?.content !== 'string') throw new Error('Invalid inference response');
        return respond( 200, { provider: 'local-ollama', model: MODEL, message: { role: 'assistant', content: output.message.content }, done: true });
      }
      return respond( 404, { error: 'Not found' });
    } catch (error) {
      if (res.destroyed) return;
      return respond(503, { error: error?.name === 'AbortError' ? 'Local model timed out or request cancelled' : 'Local model unavailable; check Ollama and the configured model' });
    }
  });
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const server = createMioLocalGateway();
  server.listen(PORT, HOST, () => console.log('MIO local inference gateway listening on http://' + HOST + ':' + PORT + ' using ' + MODEL));
}
