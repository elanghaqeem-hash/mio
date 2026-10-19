# MIO Local AI Runtime — Stage LAR-01

## Scope

This stage adds a **local-only inference gateway** to the MIO repository.
It does **not** yet integrate this gateway into MioModelRouter, enable agent tool execution, or deploy a hosted production inference service.

## Requirements

- Node.js 20+ (the MIO project already uses a newer toolchain).
- [Ollama](https://ollama.com/) installed locally and running.
- A local open-weight language model; for example `ollama pull qwen2.5:3b`.
- Enough memory and disk space for your selected model.

## Start

In terminal 1:

```bash
ollama serve
ollama pull qwen2.5:3b
```

On systems where Ollama already runs as a background service, omit `ollama serve`.

In terminal 2, from the MIO repository root:

```bash
MIO_LOCAL_MODEL=qwen2.5:3b node scripts/local-ai-gateway.mjs
```

Windows PowerShell:

```powershell
$env:MIO_LOCAL_MODEL="qwen2.5:3b"
node scripts/local-ai-gateway.mjs
```

## Check readiness

```bash
curl http://127.0.0.1:4318/health
```

Ready example: `{"status":"ready","provider":"local-ollama","model":"qwen2.5:3b","installed":true}`.

## Run a sample message

```bash
curl -X POST http://127.0.0.1:4318/v1/chat -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"Halo MIO"}]}'
```

## Security and architecture

- Only binds `127.0.0.1`, never `0.0.0.0`.
- Hardcoded upstream `http://127.0.0.1:11434` protects against arbitrary-host SSRF.
- Input size, role, conversation length, token output, and timeout are bounded.
- The service exposes only `/health` and `/v1/chat`; no tool execution or filesystem actions.
- Responses and errors are intentionally generic, and no commercial API keys are required.
- Browser CORS restricts dev origins; **CORS is not authentication**. Do not expose the port through a tunnel or public reverse proxy.
- Hosted Cloudflare Pages cannot access a model running privately on the user's computer through loopback. Production web clients need an explicitly designed authenticated local desktop bridge or a self-hosted backend.

## Stage acceptance criteria

1. Ollama lists the configured model.
2. `GET /health` reports `ready`.
3. `POST /v1/chat` yields a real assistant message.
4. Missing Ollama results in HTTP 503, not fabricated output.
5. Malformed messages return HTTP 400; oversized payloads HTTP 413.

**Verification note:** Committing this code does not prove that the model has been installed, that inference has run, or that the desktop application is connected. Test these checks in the target runtime.

## Next planned stage: LAR-02

Wire local provider into MioModelRouter with explicit provider priority, health state, abort propagation, error telemetry, and fail-closed tool permissions. Preserve existing production behavior until build, integration, and security tests pass.


## Stage LAR-02 integration (committed, not yet runtime-verified)

MIO already had a native `ModelRouter` and a `mio_local` provider supporting Ollama, vLLM and llama.cpp. LAR-02 adds **gateway** as a fourth local backend, rather than creating a second router.

In MIO Settings select:
- Provider: `mio_local`
- Local backend: `gateway` (if UI exposes the backend options; otherwise set it in saved preferences)
- Model: `qwen2.5:3b` (must equal `MIO_LOCAL_MODEL`)
- Local endpoint: `http://127.0.0.1:4318`
- Network state: `OFFLINE`
- Web search: off
- Browser read: off

Run the negative-path smoke suite with `node scripts/local-ai-gateway.test.mjs`. It checks blocked origins, invalid JSON, unsupported roles, oversized payloads and unknown routes. It does **not** verify real LLM inference.

**Important:** The gateway accepts a maximum 32 messages of 16,000 characters each and 64 KiB combined. Large project context can exceed these bounds. The frontend must handle HTTP 413 without substituting a fabricated answer.

The gateway is designed for desktop/local development only. Its loopback binding and CORS checks are **not authentication**, and it must not be publicly exposed. Additional security hardening, an explicit UI option, automated build/test verification, abort propagation and end-to-end testing remain acceptance gates before merge.
