# MIO Web Lab — Secure AI Provider Setup

## Security boundary

MIO Web Lab never accepts or persists cloud API keys in browser state, localStorage, IndexedDB, or the client bundle. Cloud inference follows this path:

```text
MIO Browser -> ModelRouter -> L4 Permission Gate -> same-origin /api/ai/generate
            -> server environment secret -> selected provider -> normalized ModelResponse
```

## Supported providers

Configure provider variables in the Cloudflare Pages environment, never in source code and never with a `VITE_` prefix.

| Provider | Required secret | Optional server model | Native internet tool |
| --- | --- | --- | --- |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` (defaults to `openrouter/free`) | Model-agnostic `web` plugin |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` (defaults to `gpt-5.6-luna`) | Responses API `web_search` |
| Google Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` (defaults to `gemini-3.6-flash`) | Google Search grounding |
| Anthropic Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` (defaults to `claude-sonnet-5`) | Claude server-side web search |

Each provider has a cost-conscious server default. The optional model variable or MIO Settings model field overrides that default. Secrets are never returned by the readiness endpoint.

OpenRouter requests use an ordered provider-side model list. MIO tries the selected `OPENROUTER_MODEL` first and automatically falls back to `openrouter/free` when that model is restricted, unavailable, rate-limited, or otherwise rejected. The normalized response reports the model OpenRouter actually used.

Live web search is an explicit opt-in because provider-side search tools can require credits even when `openrouter/free` is selected. If OpenRouter rejects its optional web plugin with HTTP 402, MIO retries once without the plugin so free AI inference remains available and reports `webSearchUsed: false`. Add OpenRouter credits only when live web search is required.

For L4 provider access, the permission dialog offers either a one-request approval or an explicit session grant. Session grants are held only in runtime memory, allow at most 60 matching requests, expire after 15 minutes of inactivity or 60 minutes total, and remain bound to the same project, provider resource, action, and network origin. Changing the routing boundary, switching offline, pressing STOP MIO, reaching the use limit, or ending the browser runtime revokes or discards the grant. L5 destructive actions remain single-use.

A successful provider readiness result is cached only in the current runtime while the provider, model, endpoint, and network mode remain unchanged. The Settings `CHECK CONNECTION` action always forces a fresh check, and any routing change or provider execution failure invalidates the cached result.

## Cloudflare Pages setup

1. Open the MIO Pages project in Cloudflare.
2. Add the chosen API key as an encrypted secret for both Preview and Production where needed.
3. Optionally add its model variable to override the secure default, or enter a model in MIO Settings.
4. Redeploy after changing environment variables.
5. Open MIO Settings and select `ONLINE MODE`.
6. Select OpenRouter, OpenAI, Gemini, or Claude. Leave model empty to use the provider default, or enter an explicit model override.
7. Select `CHECK CONNECTION`. Continue only when the selected provider reports `READY`.
8. Optionally enable live web search/grounding.
9. Send a Chat request and approve the MIO L4 request.

The browser persists autonomy, network, provider, model, fallback, and web-search preferences in the controlled `settings` storage namespace. It never persists provider secrets.

## Local Ollama

Select `Ollama — local endpoint`, provide the endpoint and an installed model name (the default is `llama3.2`). `CHECK CONNECTION` validates both the endpoint and selected model. Ollama remains usable while MIO is in OFFLINE mode because the endpoint is local. Browser connectivity still depends on the local Ollama/CORS configuration.

## Failure behavior

- Missing secret: readiness and generation return an explicit, provider-specific configuration error. Every cloud provider has a default model, while invalid overrides remain visible as upstream errors.
- Unsupported provider: the proxy rejects it before any upstream request.
- Provider HTTP error: MIO identifies the failing provider and shows a bounded upstream detail. OpenRouter first attempts its compatible `openrouter/free` fallback before returning an error.
- Malformed or empty response: MIO rejects it instead of presenting a fabricated answer.
- Provider timeout: the request fails or uses the local heuristic only when the user explicitly enabled fallback.
- Web search is reported as `USED` only when provider response metadata confirms execution.
- Provider citation metadata is normalized and rendered as clickable `WEB SOURCES` below the response.

The local heuristic is orchestration intelligence, not a cloud language model. It remains clearly labelled whenever explicitly selected or used as fallback.

## Preview versus production

Cloudflare Pages keeps Preview and Production environment variables separately. A pull-request URL such as `*.pages.dev` uses Preview variables, so configure the selected provider secret for Preview before testing a PR deployment. A secret configured only for Production will still produce `NOT_CONFIGURED` on a PR preview.
