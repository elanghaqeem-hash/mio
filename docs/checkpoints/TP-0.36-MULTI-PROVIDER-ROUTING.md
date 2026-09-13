# TP-0.36 — Multi-provider AI routing

## Outcome

MIO Web Lab routes OpenRouter, OpenAI, Google Gemini, and Anthropic Claude through the same server-side secure proxy contract. Local Ollama and the explicitly labelled MIO heuristic remain local execution paths.

## Provider parity

- Provider-specific readiness checks validate the selected provider secret and effective model without sending chat content.
- Browser-selected models override the corresponding optional server default.
- OpenAI Responses, Gemini generateContent, and Claude Messages responses normalize into `ModelResponse`.
- Provider-native web search is opt-in, L4 permission-gated, and reported as used only when the upstream response proves that a search ran.
- Provider-native citation metadata is normalized and displayed as bounded clickable web sources.
- All cloud secrets remain deployment environment variables and never enter browser storage or request payloads.
- Ollama readiness validates both endpoint reachability and model availability, including while MIO network mode is OFFLINE.
- Provider failures remain visible unless the user explicitly enables the clearly labelled local heuristic fallback.

## Required deployment configuration

Configure at least one complete provider pair:

- `OPENROUTER_API_KEY`; `OPENROUTER_MODEL` is optional and defaults to `openrouter/auto`.
- `OPENAI_API_KEY` and either `OPENAI_MODEL` or a model selected in Settings.
- `GEMINI_API_KEY` and either `GEMINI_MODEL` or a model selected in Settings.
- `ANTHROPIC_API_KEY` and either `ANTHROPIC_MODEL` or a model selected in Settings.

After changing secrets, redeploy the Cloudflare Pages project and use `CHECK CONNECTION` for the selected provider before running a live Chat test.
