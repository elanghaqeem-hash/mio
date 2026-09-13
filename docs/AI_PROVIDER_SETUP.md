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
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` (defaults to `openrouter/auto`) | Model-agnostic `web` plugin |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` | Responses API `web_search` |
| Google Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` | Google Search grounding |
| Anthropic Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | Claude server-side web search |

A server model variable is optional only when a valid model identifier is entered in MIO Settings. Secrets are never returned by the readiness endpoint.

## Cloudflare Pages setup

1. Open the MIO Pages project in Cloudflare.
2. Add the chosen API key as an encrypted secret for both Preview and Production where needed.
3. Add its model variable, or plan to enter a model in MIO Settings.
4. Redeploy after changing environment variables.
5. Open MIO Settings and select `ONLINE MODE`.
6. Select OpenRouter, OpenAI, Gemini, or Claude and enter a model when no server default exists. OpenRouter can use `openrouter/auto` when its model is left empty.
7. Select `CHECK CONNECTION`. Continue only when the selected provider reports `READY`.
8. Optionally enable live web search/grounding.
9. Send a Chat request and approve the MIO L4 request.

The browser persists autonomy, network, provider, model, fallback, and web-search preferences in the controlled `settings` storage namespace. It never persists provider secrets.

## Local Ollama

Select `Ollama — local endpoint`, provide the endpoint and an installed model name (the default is `llama3.2`). `CHECK CONNECTION` validates both the endpoint and selected model. Ollama remains usable while MIO is in OFFLINE mode because the endpoint is local. Browser connectivity still depends on the local Ollama/CORS configuration.

## Failure behavior

- Missing secret or model: readiness and generation return an explicit, provider-specific configuration error.
- Unsupported provider: the proxy rejects it before any upstream request.
- Provider HTTP error: MIO identifies the failing provider and shows a bounded upstream detail.
- Malformed or empty response: MIO rejects it instead of presenting a fabricated answer.
- Provider timeout: the request fails or uses the local heuristic only when the user explicitly enabled fallback.
- Web search is reported as `USED` only when provider response metadata confirms execution.
- Provider citation metadata is normalized and rendered as clickable `WEB SOURCES` below the response.

The local heuristic is orchestration intelligence, not a cloud language model. It remains clearly labelled whenever explicitly selected or used as fallback.

## Preview versus production

Cloudflare Pages keeps Preview and Production environment variables separately. A pull-request URL such as `*.pages.dev` uses Preview variables, so configure the selected provider secret for Preview before testing a PR deployment. A secret configured only for Production will still produce `NOT_CONFIGURED` on a PR preview.
