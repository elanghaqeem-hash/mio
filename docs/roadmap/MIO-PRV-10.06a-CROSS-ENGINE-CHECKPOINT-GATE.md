# MIO-PRV-10.06a — Cross-domain mutation checkpoint admission

**Status:** Foundation pending CI. NOT complete cross-engine deployment.

- `CapabilityProtocol` accepts an optional `MioMutationCheckpointGate`. For any manifest with `mutates: true`, an injected gate must persist PREPARED and EXECUTING before the executor is invoked.
- On success after output validation, gate records COMMITTED before returning a success result. On timeout, cancellation, provider error or invalid output it records UNCERTAIN. A checkpoint persistence error after execution yields FAILED with mutationState UNKNOWN and retryable=false.
- A duplicate request ID cannot replay the mutation within a project. The project is quarantined in-process after any checkpoint storage/reconciliation error.
- Existing permission, schema, STOP, tool and security audit admission occurs before checkpoint admission; no raw inputs or result text is stored.
- There is **no default checkpoint gate**: only runtimes configured with a genuine durable `MioCheckpointStorage` may opt in. This prevents presenting browser or ephemeral memory as crash-safe persistence.
- The provided `PersistentMutationCheckpointGate` coordinates concurrent operations only inside one JS process. There is no cross-process lease/CAS, shared-worker fencing, signed archive, platform storage adapter for this protocol, or support for guaranteed commit evidence from external creative side effects.
- The Electron mutation path has its own durable checkpoint store from PR #530; it is not replaced by this cross-domain protocol boundary.
- Existing synchronous third-party mutations and creative/model/voice subsystems that bypass `CapabilityProtocol` remain outside this gate.
- Future work: real shared DB/file adapter with transactional lease, reconciliation UI, hook all executors, OS crash fault injection and MioBench release gates.

Acceptance: all four CI workflows, security gate, web and desktop builds, full suite regression tests. No deployment claim.
