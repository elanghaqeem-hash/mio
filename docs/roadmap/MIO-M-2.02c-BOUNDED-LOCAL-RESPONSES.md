# M-2.02c — Bounded Local Runtime Response Handling

## Scope
Continue the validated M-2.02b desktop runtime without altering the Windows mutation-security gate. Both local paths now consume Ollama JSON via `readBoundedLocalJson` instead of unbounded `Response.json()`:

- `/api/tags` model discovery: maximum 1 MiB of actual response body.
- `/api/chat` single-response text inference: maximum 512 KiB of actual response body.
- Content-Length is pre-checked if present; actual decompressed/chunked bytes are checked on every read. Oversized, malformed UTF-8 and malformed JSON reject closed, not forwarded to UI.
- An unknown model remains untrusted. No HTTP redirect, cloud fallback, arbitrary endpoint or tool execution is enabled.

## Evidence
Regression `scripts/benchmarks/mio-bounded-local-json-check.ts` verifies normal parsing, chunked bodies, invalid length headers, oversized declarations, oversized chunked payloads, invalid JSON, invalid UTF-8, and oversize rejection at both the adapter and inventory. Registered in Mio CI. Latest workflow verification pending at time of commit.

## Limitations
These bounded reads do not prove an authenticated Ollama server or cover all model transports. HTTP body cancellation on oversized responses is best effort. Resource costs inside Ollama, GPU RAM, model startup time and model quality are not measured. Live Windows acceptance is opt-in via `MIO_LIVE_OLLAMA=1 node --import tsx scripts/benchmarks/mio-live-ollama-acceptance.ts`; no evidence that live inference has been executed on the user's workstation. The Windows checkpoint durability probe continues to fail and must block production mutation admission. No deployment or main merge.
