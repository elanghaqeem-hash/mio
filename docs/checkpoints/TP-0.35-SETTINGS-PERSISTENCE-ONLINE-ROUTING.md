# TP 0.35 — Persistent Preferences & Truthful Online Routing

## Scope

This corrective checkpoint addresses two Web Lab defects observed during operator testing:

1. autonomy selection returned to `ASSISTIVE` whenever Settings was unmounted;
2. online/provider selection could fall back to local heuristic output when the remote proxy was not configured, making the selected transport mode easy to misread as provider readiness.

## Corrective controls

- System preferences are persisted in the controlled `settings` storage namespace and restored before the application renders.
- Autonomy, network state, provider, model, Ollama endpoint, offline fallback, and live web-search selection share one runtime store.
- Settings and the Top Bar subscribe to the same preference state instead of maintaining divergent component-local copies.
- New online configurations do not silently opt into local fallback.
- A read-only provider readiness endpoint reports whether the server-side OpenAI secret boundary is configured without exposing the secret or sending chat content.
- Settings provides an explicit `CHECK CONNECTION` action and truthful `READY`, `NOT_CONFIGURED`, `UNREACHABLE`, or `LOCAL_ONLY` result.
- OpenAI live web search is separately selectable, remains L4 permission-gated, and is reported as used only when the provider returns a web-search tool call.
- Chat continues to expose the actual provider, model, and source; it now also exposes actual web-search use.

## Security boundaries

- No API key is accepted or stored in browser storage.
- `OPENAI_API_KEY` remains a Cloudflare/server environment secret.
- The readiness check does not send a user prompt or call the upstream model.
- Remote prompt execution and live web search remain bounded by the existing L4 scoped permission gate.
- Local fallback remains available only when the user explicitly enables it.

## Validation

- lint: PASS, 0 warnings / 0 errors;
- Web and Electron builds: PASS;
- targeted persistence/provider regression: 26/26 PASS;
- full system/security regression: 308/308 PASS;
- release preflight, deployment contract, promotion self-test, release smoke, and manifest generation: PASS.

## Deployment requirement

Code readiness does not configure the provider secret. The deployed Cloudflare Pages environment must contain `OPENAI_API_KEY` and either `OPENAI_MODEL` or a model selected in MIO Settings. After deployment, `CHECK CONNECTION` must report `READY`, followed by an approved live Chat test that reports `SOURCE: CLOUD_PROXY`.
