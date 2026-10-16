# MIO-PRV-10.04a — Recovery Snapshot Reconciliation

Status: **feature branch, CI validation required**. This is one safe increment toward PRV-10.04, not the completed durable recovery engine.

## Implemented
- `captureRecoverySnapshot(store, projectId)` creates a versioned, project-scoped, metadata-only checkpoint snapshot.
- `reconcileRecoverySnapshot(snapshot, expectedProjectId)` validates schema, exact allowed fields, size limit, unique action IDs, unique idempotency keys, bounded timestamps, supported version and strict project scope **before** restoring any state.
- An EXECUTING mutating action becomes UNCERTAIN on restore, and requires manual reconciliation; an EXECUTING non-mutating action becomes FAILED and may be **replanned**, never automatically replayed.
- COMMITTED remains COMMITTED; PREPARED remains PREPARED; UNKNOWN/UNCERTAIN mutating operations never auto-retry.
- Five regression scenarios, registered in the full validation harness.

## Critical limitations and security requirements
This increment does **not** write to disk or provide durable crash recovery. The snapshot format is a data contract, not authenticated storage, proof of commit, or authorization to retry. Untrusted snapshots must not be used to authorize side effects. Any host integration must:
- Persist snapshots atomically with integrity protection (authenticated journal/checksum with trusted key material), scoped access control and rollback protections.
- Persist a write-ahead checkpoint **before** beginning a mutating executor, then persist explicit confirmation of completion.
- Treat missing, stale, corrupt or unauthenticated records as requiring manual reconciliation, never safe-to-retry.
- Use the existing mutation journal and security audit as the ultimate reconciliation sources.
- Enforce retention policies, cancellation and project-specific permissions.
- Avoid storing prompts, credentials, paths, input/output payloads, or other sensitive contents.

## Next increments
PRV-10.04b: authenticated persistent storage adapter and crash/restart tests.
PRV-10.04c: safe checkpoint lifecycle at capability admission/execution, with fail-closed writes for mutating tasks.
PRV-10.04d: explicit reconciliation UI and integration with user approvals.
PRV-11: MioBench end-to-end failure and recovery acceptance.
