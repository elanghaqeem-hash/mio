# MIO-PRV-10.03 — Recovery Checkpoint Policy Foundation

Status: FEATURE BRANCH / CI PENDING. Not yet integrated into running tasks or persisted.

## Delivered
- `MioRecoveryCheckpointStore` conservative in-memory state machine: PREPARED → EXECUTING → COMMITTED, FAILED, or UNCERTAIN.
- Mutating action interrupted after execution begins becomes UNCERTAIN; user/manual reconciliation is mandatory. Direct EXECUTING → FAILED is rejected for mutating operations because the side effects cannot be ruled out.
- A completed mutation is NO_ACTION; an uncertain mutation is MANUAL_REVIEW_REQUIRED. SAFE_TO_REPLAN means planning only: never authorizes automatic replay.
- Duplicate action identity and repeated idempotency keys rejected within project; metadata-only records with project ID isolation.
- Unresolved in-flight or uncertain mutations block bounded-capacity eviction rather than silently disappearing.
- Five deterministic regression tests registered in the complete test harness.

## Explicit limitations
- No durable storage, journal replay, crash recovery, checkpoint restoration, automatic mutation retry, or in-flight task interception.
- Security audit and existing mutation journals remain authoritative. This class should never substitute for them.
- `MioRecoveryCheckpointStore` holds IDs and status metadata only; do not store prompts, inputs, credentials, file paths, or generated content.
- For process restarts, unresolved operations cannot yet be reconstructed. Production recovery needs durable append-only reconciliation with integrity checks.

## Next steps
1. Connect checkpoint creation before governed tool/mutation execution and terminal confirmation after durable commit.
2. Bind the active task/trace ID across capability protocol, model, creative, file mutation, voice and desktop operations.
3. Implement durable write-ahead checkpoints with hashed journal integrity, idempotency reconciliation, project isolation and migration.
4. Build explicit manual resolution UI for UNKNOWN mutation state; no implicit retry.
5. Add MioBench crash, cancellation, concurrent-project and STOP regression scenarios.
6. Gate releases on all CI, security, build, and production-acceptance checks.
