# MIO-PRV-10.02 — Capability trace collection (first live producer)

Status: IMPLEMENTED IN FEATURE BRANCH; VALIDATION REQUIRED; NOT PRODUCTION-READY.

## Implemented
- Added a non-blocking result observer to `CapabilityProtocol`, threaded through the default protocol factory.
- Connected the observer to the live `agentCapabilityProtocol` in `AgentOrchestrator`.
- Added `MioCapabilityTraceRecorder`, which collects multiple result spans into one project-scoped `MioTraceLedger` trace using the existing `traceId`. It stores only allowlisted metadata; raw prompt/response, errors, credentials, paths and provider text are not stored.
- Observability is best-effort and may not change capability decisions, output status, mutating retry policy or security audit.
- Added deterministic tests for shared spans, duplicate suppression, context mismatch and project isolation.

## Important boundaries
- Only agent calls that pass through `agentCapabilityProtocol` with a projectId are captured. The direct chat/model path and separate desktop/voice producer paths are not instrumented.
- The trace remains RUNNING until a later task-lifecycle integration finishes it; this is deliberate to permit multiple capability calls to share the same trace.
- The ledger is in-memory, bounded, not persisted, and not a recovery journal. Overflow or malformed metadata may drop observability records, not capability execution.
- The project's security audit and mutation journals remain authoritative. No secret or raw content is stored.
- No claim of end-to-end tracing, live production verification, or Cloudflare deployment.

## Next implementation steps
1. Carry a common task/trace ID across model calls, permission decisions, tools, creative and voice.
2. Add lifecycle close and recovery/UNKNOWN mutation handling without automatic replay of uncertain mutations.
3. Add durable redacted trace storage and telemetry export only after privacy and retention requirements are approved.
4. Add MioBench end-to-end traces across success, deny, cancellation, timeout, concurrent projects and emergency stop.
5. Execute lint, web/Electron builds, full tests, security regression gate and GitHub CI before merging.
