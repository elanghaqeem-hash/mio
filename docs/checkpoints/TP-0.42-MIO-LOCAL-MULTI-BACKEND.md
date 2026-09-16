# TP-0.42 — MIO Local Multi-Backend Inference

## Goal

Decouple MIO Local Intelligence from a single inference runtime. The native MIO Local provider can now use Ollama, vLLM, or llama.cpp server while keeping one agent/tool contract.

## Supported backends

| Backend | Default loopback endpoint | Readiness | Chat |
| --- | --- | --- | --- |
| Ollama | `http://127.0.0.1:11434` | `GET /api/tags` | `POST /api/chat` |
| vLLM | `http://127.0.0.1:8000` | `GET /v1/models` | `POST /v1/chat/completions` |
| llama.cpp server | `http://127.0.0.1:8080` | `GET /v1/models` | `POST /v1/chat/completions` |

vLLM and llama.cpp use their OpenAI-compatible local server APIs. Ollama retains its native API.

## Security boundary

`mio_local` inference is deliberately restricted to loopback endpoints:

- `localhost`
- `127.0.0.1`
- `::1`

HTTP and HTTPS are accepted only on those loopback hosts. Embedded URL credentials and non-loopback targets are rejected before inference starts.

This prevents a configuration labelled "local" from silently transmitting prompts or project context to a LAN or remote server without MIO network authorization. The separate raw Ollama provider remains available for legacy/configurable deployments, while any future governed remote inference should be represented as a network-aware provider/service with explicit permission scope.

## Architecture

```text
MIO Local Provider
      |
      +-- Agent policy / application context / tool loop
      |
      +-- LocalInferenceBackend
             |
             +-- Ollama adapter ------ /api/chat
             |
             +-- vLLM adapter -------- /v1/chat/completions
             |
             +-- llama.cpp adapter --- /v1/chat/completions
```

Tool use, project knowledge, web-grounding policy, citations, token aggregation, and MIO permission governance remain in `MioLocalProvider`; inference-protocol details live in the backend adapter.

## Settings behavior

MIO Settings now exposes a Local Inference Backend selector. Changing backend resets the endpoint to its safe loopback default and invalidates provider readiness/session routing state. Backend selection and endpoint are persisted in controlled settings storage.

## Readiness behavior

- Ollama confirms the configured model appears in `/api/tags`.
- vLLM confirms the configured model ID appears in `/v1/models`.
- llama.cpp is a single-model server in common deployments; when one loaded model is reported but its model ID differs from the configured alias, readiness remains available and explains the alias mismatch. Configure `--alias` for deterministic model identity.

## Tests

The TP-0.42 regression suite verifies:

- non-loopback MIO Local endpoints are rejected;
- localhost endpoints are accepted;
- Ollama uses native `/api/chat` and `/api/tags`;
- vLLM uses `/v1/chat/completions` and `/v1/models` and maps generation controls;
- llama.cpp uses the OpenAI-compatible route and reports its single loaded model;
- ModelRouter readiness follows the selected backend even while MIO network mode is OFFLINE;
- backend selection and endpoint survive settings reinitialization.

## Deferred

- runtime-managed model process startup/shutdown;
- GPU/VRAM-aware backend recommendation;
- promoted-model activation into the selected backend;
- authenticated remote vLLM deployments (must be governed as remote/network capabilities, not MIO Local loopback inference);
- interactive browser tool integration into the MIO Local agent loop.
