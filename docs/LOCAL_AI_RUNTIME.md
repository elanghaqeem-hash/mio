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


## LAR-05 — Mocked end-to-end gateway contract

Run `node scripts/local-ai-gateway.integration.test.mjs` to test the full HTTP path `/health` and `/v1/chat` against a stubbed in-process Ollama transport. The test verifies route payload, selected model, response, browser origin and propagation of client disconnection to the upstream inference request. No external AI services are needed; these are **mock-inference** tests, not evidence of a real model's quality or availability.

The GitHub Actions local gateway check runs both the negative-path suite and the mock integration suite, followed by the web build. Full real-model acceptance still requires starting Ollama with the configured model and running chat, latency, concurrency, STOP MIO and memory-context checks in the actual desktop runtime. Do not merge until the current head commit's CI passes.


## LAR-06 — Real-model acceptance (requires local hardware)

After starting Ollama and the MIO gateway using the same configured model, execute:

```bash
node scripts/local-ai-real-model-smoke.mjs
```

Expected final output: a JSON summary with `"result":"PASS"`, the configured model, non-zero response length, and `"apiKeysRequired":false`. This test performs real inference and must **not** be reported as passed unless actually run on a machine with Ollama and the configured weights. It is intentionally not executed in shared CI runners, because the model installation and compute hardware are not provided.

For the complete desktop test, separately verify (1) Settings selects the `gateway` backend, (2) Chat answers with `modelProvider=mio_local`, (3) the response provenance identifies a local endpoint, and (4) STOP MIO cancels an active generation. A successful direct gateway smoke test alone does not establish complete desktop functionality.


## LAR-07 — Desktop adapter contract

The test `node --import tsx scripts/local-ai-desktop-adapter.test.ts` exercises the actual TypeScript local inference adapter used by MIO Settings and ModelRouter. The test substitutes the HTTP fetch transport (not a real model), and verifies readiness, chat message output, configured model identity, AbortSignal propagation, and rejection of non-loopback hosts.

This test has been wired into GitHub Actions. It is not proof of GUI clicks, desktop installer behavior, or a real Ollama generation; these remain separate manual acceptance gates. Keep PR in draft until all current-head CI checks pass and the local device can demonstrate inference plus STOP MIO.


## LAR-08 — CI remediation and release gate

The first desktop-adapter CI run failed at TypeScript script transformation because `tsx` ran with CJS output where top-level `await` was unsupported. This is a test harness failure, not evidence that the desktop adapter itself failed. The test now executes under an async `main()` wrapper; verify the new workflow run is green before merging.

The CI dependency install also reported **14 advisories (9 moderate, 3 high, 2 critical)**. These are dependency audit findings, not proof of reachable production exploits. Classify the actual packages and reachable paths using `npm audit --json` and prioritize fixable runtime vulnerabilities. Avoid blind `npm audit fix --force` because it may introduce breaking changes.

**Release must stay blocked until** current-head CI passes, real local-model inference is witnessed on intended desktop hardware, STOP MIO is tested while generation is active, and relevant critical/high dependency advisories are triaged. Do not mistake green mock tests for production readiness.


## LAR-09 — Security release gate

The previous PR head passed all seven workflows, including gateway smoke tests, mocked inference/cancellation, desktop adapter and build. CI logs continue to report 14 total npm vulnerabilities (9 moderate, 3 high, 2 critical). Do not infer exact affected packages from the summary alone.

A separate `MIO Dependency Security Audit` GitHub Action now:
- gates high/critical vulnerabilities in production dependencies with `npm audit --omit=dev --audit-level=high`;
- saves the full dependency audit inventory as a seven-day workflow artifact for triage;
- avoids auto-upgrading transitive dependencies without assessing compatibility.

Passing the production-dependency gate alone does not clear development/build-tool advisories or prove production security. Review the full inventory and remediate reachable high/critical paths prior to release. This workflow is **new and must pass on the current head**.

Model weights must be installed and a real local inference + STOP MIO test run on target hardware before merge and deployment.
