# MIO-PRV-05 — Unified Capability Protocol

Status: **05.01–05.04 IMPLEMENTED · VERIFIED (local) · INTEGRATED** (the agent's research, project, and creative calls go through the protocol).

## What it is

`src/capabilities/` adds one protocol between the agent and every capability:

```
MioCapabilityRequest ─► CapabilityProtocol.invoke ─► executor (ToolRouter │ SecureServiceGateway │ native) ─► MioCapabilityResult
```

For each call, `invoke` does the following, in order:

1. **Contract.** The request must pass `validateMioCapabilityRequest`: schema version, identifiers, context, permission, and no secret-bearing fields.
2. **Manifest.** An undeclared capability gets `DENIED / CAPABILITY_UNAVAILABLE` and is audited.
3. **Admission.** `CapabilityRegistry.authorize` checks availability, mode, and scope fields.
4. **Declared permission.** A request may not declare a lower level than the manifest requires. Otherwise it gets `DENIED / PERMISSION_DENIED`.
5. **STOP or task cancellation** → `CANCELLED` before anything runs.
6. **Input bounds.** JSON byte size against `limits.maxInputBytes`, then the manifest `inputSchema` → `VALIDATION_FAILED`.
7. **Execution.**
   - Timeout is the smaller of the manifest timeout and the request budget.
   - STOP MIO and task cancellation abort the executor's `AbortSignal`.
   - The existing ToolRouter/SecureServiceGateway permission, policy, and resource gates still run underneath.
8. **Output bounds.** Size and `outputSchema` → `VALIDATION_FAILED`.
9. **Result.**
   - A `MioCapabilityResult` with a `CAPABILITY_CALL` trace span. Error text is redacted.
   - A failed call to a mutating capability that had started executing is `mutationState: UNKNOWN` and never retryable.
   - The call is audited as a `SECURITY_EVENT` according to the manifest (`ALWAYS`, or `ON_FAILURE`).

`discover(mode)` returns the manifests the agent may call in a mode in this runtime.

## Manifest (05.01)

`MioCapabilityManifest` extends the existing `CapabilityDescriptor` with:
- `manifestVersion`
- `domain`
- `inputSchema` / `outputSchema` (a small, bounded JSON-Schema subset)
- `limits`
- `cancellation` (`ABORT_SIGNAL`, `BETWEEN_STEPS`, or `NONE`)
- `audit`
- `mutates`

`validateCapabilityManifest` rejects a manifest that would weaken governance:
- A mutating capability must be audited on every call, require at least `L2_CREATE`, and be cancellable if it runs longer than 5 s.
- High or critical risk must be audited on every call.
- Network access requires at least `L2`. The one exception is `model.generate`, whose remote routes carry their own L4 grant.
- Input must be an object, and limits must be positive.

Existing capabilities keep their `CapabilityRegistry` descriptor as the single source of truth. `declare` refuses a manifest that differs from the registry entry.

## Manifests (05.02)

| Domain | Capability | Executor | Permission | Cancellation | Audit |
|---|---|---|---|---|---|
| FILES | `service.desktop.workspace.read-text`, `.list` | Desktop SecureServiceGateway (desktop only; unavailable on web) | L0 | NONE | ON_FAILURE |
| RESEARCH | `research.search` | ToolRouter | L4 | ABORT_SIGNAL | ALWAYS |
| MEMORY | `memory.recall` (new) | MemoryContextManager, project-scoped, trust-labelled | L0 | NONE | ON_FAILURE |
| MODEL | `model.generate` (new) | ModelRouter (budget, privacy, remote L4 grant, provenance unchanged) | L1 | ABORT_SIGNAL | ON_FAILURE |
| CREATIVE | `creative.execute` | ToolRouter → Creative Engine (mutates project assets) | L2 | BETWEEN_STEPS | ALWAYS |
| VOICE | `voice.speak`, `voice.stop` (new) | MioChatVoiceController | L1 / L0 | ABORT_SIGNAL / NONE | ON_FAILURE |
| PROJECT | `project.inspect` | ToolRouter | L1 | NONE | ON_FAILURE |

## Integration (05.03)

`AgentOrchestrator` now calls `research.search`, `project.inspect`, and `creative.execute` through `agentCapabilityProtocol.invoke`, not through the ToolRouter directly. The existing agent and integration suites pass unchanged.

## Tests (05.04)

`src/tests/capabilityProtocolTests.ts` has 14 tests, and the suite is part of the security gate. It covers:

- unknown capability
- invalid contract (wrong version, secret-bearing input, non-object request)
- seven schema and size violations
- under-declared permission
- disallowed mode
- unavailable capability
- a user rejecting the L4 prompt
- output schema violation
- a failed mutating call reporting UNKNOWN and not retryable
- timeout with abort
- STOP mid-call and STOP before a call
- a successful end-to-end call with a contract-valid result
- error redaction
- manifest governance rules and registry mismatch
- schema-validator bounds

## Remaining gaps

- The chat model path still calls `ModelRouter` directly, because it needs the context pipeline from PRV-03.06. Moving it behind `model.generate` belongs with PRV-10 tracing.
- `ToolExecutionContext` and `CapabilityExecutionContext` are still separate types. The protocol maps between them.
- Executors report failures from ToolRouter and SecureServiceGateway as free text. `classifyLegacyFailure` maps that text to error codes. Native error codes in those layers belong to PRV-10.
- The desktop FILES services need the desktop gateway passed to `createDefaultCapabilityProtocol` in the Electron renderer. They are declared, and they are denied as unavailable on web.
