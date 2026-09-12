const MAX_PROMPT_CHARS = 120_000;
const MAX_RESPONSE_CHARS = 2_000_000;
const TIMEOUT_MS = 45_000;

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

function cleanError(error) {
  return (error instanceof Error ? error.message : 'AI provider request failed').replace(/[\r\n]+/g, ' ').slice(0, 500);
}

async function fetchJson(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_CHARS) throw new Error('Provider response exceeds safety limit');
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
    if (!response.ok) throw new Error(String(data?.error?.message || data?.message || `HTTP ${response.status}`).slice(0, 500));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function providerConfig(env, provider) {
  if (provider === 'openai' && env.OPENAI_API_KEY && env.OPENAI_MODEL) return { key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL };
  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL) return { key: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL };
  if (provider === 'gemini' && env.GEMINI_API_KEY && env.GEMINI_MODEL) return { key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
  return null;
}

async function callOpenAI(config, prompt) {
  const data = await fetchJson('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key}` },
    body: JSON.stringify({ model: config.model, input: prompt, max_output_tokens: 1600 }),
  });
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  const chunks = Array.isArray(data?.output)
    ? data.output.flatMap((item) => Array.isArray(item?.content) ? item.content : []).map((part) => part?.text).filter(Boolean)
    : [];
  if (!chunks.length) throw new Error('OpenAI returned no text output');
  return chunks.join('\n');
}

async function callAnthropic(config, prompt) {
  const data = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: config.model, max_tokens: 1600, messages: [{ role: 'user', content: prompt }] }),
  });
  const text = Array.isArray(data?.content) ? data.content.filter((item) => item?.type === 'text').map((item) => item.text).join('\n') : '';
  if (!text) throw new Error('Anthropic returned no text output');
  return text;
}

async function callGemini(config, prompt) {
  const model = encodeURIComponent(config.model);
  const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text).filter(Boolean).join('\n') || '';
  if (!text) throw new Error('Gemini returned no text output');
  return text;
}

export async function onRequestPost({ request, env }) {
  let provider = '';
  const started = Date.now();
  try {
    const body = await request.json();
    provider = typeof body?.provider === 'string' ? body.provider : '';
    if (!['openai', 'anthropic', 'gemini'].includes(provider)) {
      return new Response(JSON.stringify({ success: false, provider, error: 'Unsupported web AI provider' }), { status: 400, headers });
    }
    const config = providerConfig(env, provider);
    if (!config) {
      return new Response(JSON.stringify({ success: false, provider, error: `${provider} is not configured in Cloudflare secrets/model variables` }), { status: 503, headers });
    }
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
      return new Response(JSON.stringify({ success: false, provider, error: `Prompt must be 1-${MAX_PROMPT_CHARS} characters` }), { status: 400, headers });
    }

    let text = '';
    if (provider === 'openai') text = await callOpenAI(config, prompt);
    else if (provider === 'anthropic') text = await callAnthropic(config, prompt);
    else text = await callGemini(config, prompt);

    const connectionTest = body?.connectionTest === true;
    if (connectionTest && !text.toUpperCase().includes('MIO_CONNECTION_OK')) {
      return new Response(JSON.stringify({ success: false, provider, error: 'Unexpected connection-test response', latencyMs: Date.now() - started }), { status: 502, headers });
    }

    return new Response(JSON.stringify({ success: true, provider, text: text.slice(0, MAX_RESPONSE_CHARS), latencyMs: Date.now() - started }), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, provider, error: cleanError(error), latencyMs: Date.now() - started }), { status: 502, headers });
  }
}

export function onRequest() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...headers, allow: 'POST' } });
}
