# MIO Web Lab — Secure AI Provider Setup

## Security Rule
MIO Web Lab does **not** accept or persist cloud API keys in browser state, localStorage, IndexedDB, or the client bundle.

Cloud path:

```text
MIO Browser
  -> ModelRouter
  -> L4 Permission Gate
  -> same-origin /api/ai/generate
  -> server environment secret
  -> OpenAI Responses API
  -> normalized ModelResponse
  -> MIO Chat
```

## OpenAI on Cloudflare Pages
Configure these variables in the Cloudflare project environment rather than in source code:

- `OPENAI_API_KEY` — required secret.
- `OPENAI_MODEL` — optional server default model. If omitted, choose a model in MIO Settings.

Never place the API key in a `VITE_*` variable because Vite-exposed variables can be included in the browser bundle.

After server configuration:

1. Open MIO Settings.
2. Select `ONLINE MODE`.
3. Select `OpenAI — server-side MIO Secure Proxy`.
4. Optionally enter a model identifier, or leave it blank to use `OPENAI_MODEL` from the server environment.
5. Select `CHECK CONNECTION`; continue only when the provider reports `READY`.
6. Enable live web search when current internet information is required.
7. Send a Chat request.
8. MIO will display an L4 permission request before sending prompt content to the external provider or invoking web search.

The browser persists autonomy, network, provider, model, fallback, and web-search preferences in the controlled `settings` storage namespace. Provider secrets remain server-side and are never persisted with these preferences.

## Local Ollama
Select `Ollama — local endpoint`, provide a model name and local endpoint (default `http://127.0.0.1:11434`). Browser connectivity depends on the local Ollama/CORS environment. MIO never pretends that Ollama executed if the endpoint is unavailable.

## Offline Mode
`MIO Local Heuristic` is the transparent fallback. It supports local orchestration/classification behavior but explicitly states that it is not a cloud language model.

## Failure Behavior
- Missing server secret: proxy returns an explicit configuration error.
- Unsupported provider: proxy rejects the request.
- Malformed/empty provider response: ModelRouter rejects it.
- Provider timeout: request fails or, when explicitly enabled, uses the labeled local fallback.
- Local fallback is disabled by default for a newly configured online provider so a missing secret or unavailable provider is surfaced as an error rather than appearing to be a successful online response.
- Remote provider use is never silent; it passes the permission gate.
