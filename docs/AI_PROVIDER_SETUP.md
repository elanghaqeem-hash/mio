# MIO Web Lab — Secure AI Provider Setup

## Security boundary

MIO Web Lab never accepts or persists cloud API keys in browser state, localStorage, IndexedDB, or the client bundle. Cloud inference follows this path:

```text
MIO Browser -> ModelRouter -> L4 Permission Gate -> same-origin /api/ai/generate
            -> server environment secret -> selected provider -> normalized ModelResponse
```

MIO Local uses a different boundary: inference stays on a loopback-only local runtime. Optional live research is a separate, governed network capability:

```text
MIO -> ModelRouter -> MIO Local Intelligence -> local inference backend
                    -> optional L4 gate -> /api/research -> external search sources
```

## Supported providers

Configure provider variables in the Cloudflare Pages environment, never in source code and never with a `VITE_` prefix.

| Provider | Required secret | Optional server model | Native internet tool |
| --- | --- | --- | --- |
| MIO Local Intelligence | None | Local model name, default `qwen3:8b` | Governed MIO Research Proxy |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` (defaults to `openrouter/free`) | Model-agnostic `web` plugin |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` (defaults to `gpt-5.6-luna`) | Responses API `web_search` |
| Google Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` (defaults to `gemini-3.6-flash`) | Google Search grounding |
| Anthropic Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` (defaults to `claude-sonnet-5`) | Claude server-side web search |

Each cloud provider has a cost-conscious server default. The optional model variable or MIO Settings model field overrides that default. Secrets are never returned by the readiness endpoint.

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

The browser persists autonomy, network, provider, model, local-backend selection, fallback, and web-search preferences in the controlled `settings` storage namespace. It never persists provider secrets.

## MIO Local Intelligence

Select `MIO Local Intelligence — native local model + governed tools` to use the native MIO local-provider layer. MIO Local now separates the agent/tool layer from the inference runtime and supports three local backends:

| Backend | Default endpoint | Readiness | Inference |
| --- | --- | --- | --- |
| Ollama | `http://127.0.0.1:11434` | `/api/tags` | `/api/chat` |
| vLLM | `http://127.0.0.1:8000` | `/v1/models` | `/v1/chat/completions` |
| llama.cpp server | `http://127.0.0.1:8080` | `/v1/models` | `/v1/chat/completions` |

Default model: `qwen3:8b`. For vLLM, enter the exact model ID exposed by `/v1/models`, for example a Hugging Face model ID used when the server was launched. For llama.cpp, configure a stable `--alias` when you want the model identity in MIO to match the server exactly.

MIO Local inference endpoints are restricted to loopback hosts (`localhost`, `127.0.0.1`, or `::1`). This is intentional: a provider labelled local must not silently send prompts or project context to a LAN or remote server. If remote inference is needed, expose it through a separately governed remote provider/service with explicit network authorization instead of relaxing the MIO Local boundary.

The research gateway remains `/api/research` by default and live web grounding remains disabled until explicitly enabled.

MIO Local remains usable in `OFFLINE MODE`. If web grounding is enabled in Settings but the network mode is OFFLINE, MIO suppresses the research capability and continues with local inference only. In `ONLINE MODE`, a model can request a bounded `web.search` tool call. MIO then obtains L4 authorization, sends only the bounded search query to the configured research gateway, labels returned evidence as `UNTRUSTED`, and returns the evidence to the local model for a grounded final answer.

The local model never receives unrestricted network access. Search results are data, not instructions or permission. The initial agent loop permits at most two search rounds per model request before forcing a final answer.

The current `/api/research` gateway supports Brave Search when `BRAVE_SEARCH_API_KEY` is configured and otherwise falls back to public Wikipedia Indonesia and Crossref sources. A future MIO Search/SearXNG adapter can use the same provider boundary without changing the local-model contract.

### Local runtime examples

- **Ollama:** run Ollama on its standard loopback endpoint, install the selected model, choose `Ollama` in MIO Local backend settings, and use `CHECK CONNECTION`.
- **vLLM:** start the OpenAI-compatible server on loopback (commonly port `8000`), select `vLLM`, enter the served model ID, and use `CHECK CONNECTION`.
- **llama.cpp server:** start `llama-server` on loopback (commonly port `8080`), preferably set `--alias`, select `llama.cpp server`, and use `CHECK CONNECTION`.

MIO Local does not store backend API keys. The multi-backend path is designed for local loopback runtimes. Authenticated or remotely exposed vLLM/llama.cpp deployments require a future network-governed provider boundary.

## Local Ollama

Select `Ollama — raw local endpoint`, provide the endpoint and an installed model name (the default is `llama3.2`). `CHECK CONNECTION` validates both the endpoint and selected model. Raw Ollama remains usable while MIO is in OFFLINE mode because the endpoint is local. Browser connectivity still depends on the local Ollama/CORS configuration.

Use raw Ollama when direct inference is desired without the MIO-native bounded tool loop. Use MIO Local Intelligence when local inference should participate in MIO governance, web grounding, citations, training/model-promotion lifecycle, and later native memory/tool extensions.

## Failure behavior

- Missing secret: readiness and generation return an explicit, provider-specific configuration error. Every cloud provider has a default model, while invalid overrides remain visible as upstream errors.
- Unsupported provider: the proxy rejects it before any upstream request.
- Provider HTTP error: MIO identifies the failing provider and shows a bounded upstream detail. OpenRouter first attempts its compatible `openrouter/free` fallback before returning an error.
- MIO Local endpoint/model unavailable: backend-specific readiness reports the missing model or unreachable endpoint; generation can use the local heuristic only when fallback is explicitly enabled.
- Non-loopback MIO Local endpoint: configuration is rejected before inference to preserve the local-data boundary.
- MIO Local research failure: local inference continues, but the model is told not to claim that current facts were verified.
- Malformed or empty response: MIO rejects it instead of presenting a fabricated answer.
- Provider timeout: the request fails or uses the local heuristic only when the user explicitly enabled fallback.
- Web search is reported as `USED` only when the relevant provider or MIO Local agent cycle actually attempts live grounding.
- Provider citation metadata is normalized and rendered as clickable `WEB SOURCES` below the response.

The local heuristic is orchestration intelligence, not a language model. It remains clearly labelled whenever explicitly selected or used as fallback.

## Preview versus production

Cloudflare Pages keeps Preview and Production environment variables separately. A pull-request URL such as `*.pages.dev` uses Preview variables, so configure the selected provider secret for Preview before testing a PR deployment. A secret configured only for Production will still produce `NOT_CONFIGURED` on a PR preview.
