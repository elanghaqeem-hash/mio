interface Env {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

interface ProxyMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ProxyRequest {
  provider?: string;
  model?: string;
  messages?: ProxyMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

export async function onRequestPost(context: PagesContext): Promise<Response> {
  let body: ProxyRequest;
  try {
    body = (await context.request.json()) as ProxyRequest;
  } catch {
    return json({ error: 'Invalid JSON request body' }, 400);
  }

  if (body.provider !== 'openai') {
    return json({ error: `Provider '${body.provider ?? 'unknown'}' is not enabled by this Web Lab proxy` }, 501);
  }

  if (!context.env.OPENAI_API_KEY) {
    return json({ error: 'OpenAI provider is not configured on the server' }, 503);
  }

  const messages = Array.isArray(body.messages)
    ? body.messages.filter(
        (message): message is ProxyMessage =>
          Boolean(message) &&
          (message.role === 'system' || message.role === 'user' || message.role === 'assistant') &&
          typeof message.content === 'string' &&
          message.content.length > 0 &&
          message.content.length <= 50000
      )
    : [];

  if (messages.length === 0 || messages.length > 50) {
    return json({ error: 'A valid message list is required (1-50 messages)' }, 400);
  }

  const model = body.model || context.env.OPENAI_MODEL;
  if (!model) {
    return json({ error: 'No OpenAI model is configured' }, 503);
  }

  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
    .slice(0, 50000);

  const input = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role, content: message.content }));

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        ...(instructions ? { instructions } : {}),
        input,
        ...(typeof body.temperature === 'number' ? { temperature: Math.max(0, Math.min(body.temperature, 2)) } : {}),
        ...(typeof body.maxOutputTokens === 'number'
          ? { max_output_tokens: Math.max(16, Math.min(Math.round(body.maxOutputTokens), 8192)) }
          : {}),
        store: false,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return json({ error: 'OpenAI request failed', upstreamStatus: upstream.status, detail: detail.slice(0, 500) }, upstream.status);
    }

    const payload = (await upstream.json()) as {
      model?: string;
      status?: string;
      output_text?: string;
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      incomplete_details?: { reason?: string } | null;
    };

    const outputText =
      payload.output_text?.trim() ||
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .filter((content) => content.type === 'output_text' && typeof content.text === 'string')
        .map((content) => content.text)
        .join('\n')
        .trim();

    if (!outputText) return json({ error: 'Provider returned no text output' }, 502);

    return json({
      provider: 'openai',
      model: payload.model ?? model,
      text: outputText,
      usage: {
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      },
      finishReason: payload.incomplete_details?.reason ?? payload.status ?? 'completed',
      source: 'CLOUD_PROXY',
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'AI proxy request failed' }, 502);
  }
}
