const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

function configuredProvider(env, provider, keyName, modelName) {
  const hasKey = typeof env[keyName] === 'string' && env[keyName].trim().length > 0;
  const model = typeof env[modelName] === 'string' ? env[modelName].trim() : '';
  if (!hasKey || !model) return null;
  return {
    provider,
    mode: 'api',
    model,
    endpoint: null,
    executable: null,
    enabled: true,
    lastTestAt: null,
    lastStatus: 'untested',
    lastError: null,
    hasSecret: true,
    secretStorage: 'cloudflare-encrypted-secret',
  };
}

export async function onRequestGet({ env }) {
  const aiProviders = [
    configuredProvider(env, 'openai', 'OPENAI_API_KEY', 'OPENAI_MODEL'),
    configuredProvider(env, 'anthropic', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'),
    configuredProvider(env, 'gemini', 'GEMINI_API_KEY', 'GEMINI_MODEL'),
  ].filter(Boolean);

  return new Response(JSON.stringify({
    runtime: 'cloudflare-pages',
    generatedAt: new Date().toISOString(),
    serverManagedSecrets: true,
    aiProviders,
    research: {
      live: true,
      provider: env.BRAVE_SEARCH_API_KEY ? 'brave-search' : 'wikipedia-crossref',
      fullWeb: Boolean(env.BRAVE_SEARCH_API_KEY),
      requiresSecretForFullWeb: !env.BRAVE_SEARCH_API_KEY,
    },
    motion: {
      engine: 'MediaPipe Pose Landmarker',
      inference: 'local-browser',
      cloudUpload: false,
    },
  }), { status: 200, headers: jsonHeaders });
}

export function onRequest() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...jsonHeaders, allow: 'GET' } });
}
