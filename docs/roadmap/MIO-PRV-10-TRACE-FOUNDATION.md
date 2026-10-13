# MIO-PRV-10.01 — Execution Trace Ledger foundation

Status: IMPLEMENTED IN FEATURE BRANCH; NOT YET VERIFIED BY CI; NOT INTEGRATED WITH LIVE RUNTIME.

## Scope
- Add a bounded in-memory ledger around the already defined and validated `MioExecutionTrace` core contract.
- Each operation requires exact project ID; cross-project access appears as not-found.
- Strict lifecycle: begin → append span → finish terminal outcome. No append/finish after terminal status.
- Record only allowlisted diagnostic metadata. Arbitrary `span.detail`, inputs, prompts, outputs, paths and credentials are never retained.
- Detach snapshots to prevent caller mutation; bound retention and per-trace span counts.
- Include deterministic standalone regression tests for isolation, contract validation, timing, duplicate IDs and retention.

## Deliberately out of scope
- This does not mean end-to-end observability is operational.
- No automatic wiring into ModelRouter, CapabilityProtocol (pending PR #524), agent runtime, permissions, voice, creative, or desktop.
- No persistence, crash recovery, telemetry collection, cross-process delivery, pricing aggregation, or production validation.
- The ledger is not a security audit log and must not replace durable security and mutation journals.

## Required next steps for Claude continuation
1. Merge/reconcile PR #524 before integrating capability spans, preserving its protocol governance checks.
2. Create trace emitters for model, capability, permission, tool, creative, voice and task events; carry a single `traceId` consistently.
3. Add cancellation, failure and mutation-state UNKNOWN regression cases; never automatically retry uncertain mutations.
4. Establish a durable redacted event store and separate crash recovery checkpoint design, with storage cap and retention policy.
5. Register the ledger suite in repository test harness and security gate when producers are wired; run full lint, builds, npm test, security gate and CI.
6. Expand MioBench to validate real end-to-end traces and no cross-project leakage.

Acceptance for this slice: TypeScript builds, deterministic tests pass, CI green; operational gate remains PARTIAL until tracing is connected to real runtime.
