# TP-0.38 — MIO Local Provider

## Objective

Introduce `mio_local` as a first-class native AI provider that keeps model inference local while allowing explicitly enabled, permission-gated live web grounding through the existing MIO research gateway.

## Delivered

- Added `MioLocalProvider` with an Ollama-compatible local inference backend.
- Default local model: `qwen3:8b`.
- Added bounded MIO agent tool protocol for `web.search`.
- Added maximum two-round search loop before forcing a final local answer.
- Added untrusted-evidence envelope and source markers for prompt-injection resistance.
- Added normalized citations and aggregated local token usage across agent rounds.
- Added `mioLocalEndpoint` and `researchEndpoint` router configuration.
- Added MIO Local readiness validation against `/api/tags`.
- MIO Local continues to work in OFFLINE mode; web grounding is automatically suspended offline.
- ONLINE web grounding is included in the existing L4 scoped-permission and network-governance boundary.
- Added Settings UI for MIO Local model, local endpoint, research gateway, and governed web-grounding toggle.
- Kept raw `ollama` provider available as a separate direct-local option.
- Added dedicated `mioLocalProviderTests` and registered them in the full validation suite.
- Updated AI provider setup documentation.

## Security properties

1. Local inference content is sent only to the configured local inference endpoint.
2. The local model never receives unrestricted internet access.
3. When web grounding is enabled, only bounded search queries are sent to the configured research gateway.
4. Search results are normalized, bounded, and labelled `UNTRUSTED` before being returned to the model.
5. Instructions found inside external evidence are explicitly non-authoritative.
6. Switching MIO to OFFLINE revokes network session grants and suppresses web grounding without disabling local inference.
7. Changing model, endpoint, research gateway, provider, or web-search configuration invalidates the routing authorization boundary.

## Runtime path

```text
User
  -> ModelRouter
  -> MIO Local Intelligence
  -> local Ollama-compatible /api/chat
  -> optional MIO_TOOL_CALL web.search
  -> L4 scoped permission / network governance
  -> /api/research
  -> bounded UNTRUSTED evidence
  -> local /api/chat
  -> grounded answer + citations
```

## Validation focus

The automated MIO Local test covers:

- first-class `mio_local` response identity;
- bounded research query forwarding;
- no research call when web grounding is disabled;
- untrusted evidence labelling;
- normalized citations;
- token-usage aggregation across local agent rounds;
- continued local answer generation without web access.

## Deferred follow-up

Not part of TP-0.38:

- full browser automation / Playwright actions;
- SearXNG adapter;
- vLLM and llama.cpp inference adapters;
- native structured function-calling protocol beyond bounded web search;
- training pipeline (SFT/LoRA/DPO) and MioBench;
- local embedding/vector memory model.

These should be implemented as separate checkpoints after TP-0.38 is validated and merged.
