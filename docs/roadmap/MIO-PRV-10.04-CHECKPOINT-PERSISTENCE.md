# MIO-PRV-10.04a — Scoped checkpoint archive / restart reconciliation

Status: IMPLEMENTED ON FEATURE BRANCH; CI NOT YET VERIFIED. NOT A PRODUCTION DURABLE RECOVERY ENGINE.

## Delivered
- Strict, versioned JSON checkpoint archive with a project scope, bounded size/row count, exact allowed fields, identities, timestamps, duplicate rejection and fail-closed errors.
- Reconstitution into existing `MioRecoveryCheckpointStore`; an EXECUTING mutation is reconstructed as UNCERTAIN after restart, requiring manual review. EXECUTING read-only work becomes FAILED and can only be replanned, never implicitly executed.
- Preserves COMMITTED, PREPARED and FAILED states with strict state checks.
- Injected `MioCheckpointStorage` interface: `read(projectId)` and `atomicWrite(projectId, json)`. The implementer **must** ensure an atomic replace and durable flush; the supplied module does not itself provide a disk or database implementation.
- No automatic replay. Corrupt or mismatched saved history throws rather than silently clearing history.
- Five regression scenarios registered in the full MIO harness.

## Boundaries
- This does not yet hook every actual tool or mutation into a write-ahead checkpoint.
- No browser/localStorage fallback is provided or permitted as evidence of crash-safe persistence.
- There is no cryptographic integrity verification, access-control enforcement by the backing storage, migration between archive versions, distributed lock, backup, or storage encryption.
- An atomic storage adapter must be implemented per platform (Electron/workspace, server or Cloudflare) and tested under process-kill and failed-write conditions.
- Explicitly preserve existing MutationJournal and its audit semantics, and never store arbitrary inputs, prompts, paths, secrets or tool outputs.

## Next phase
1. Implement a platform-appropriate durable transactional backend (atomic replace + fsync for desktop; transaction/CAS for DB), with isolation and retention.
2. Wire `prepare` persistence **before** any mutating executor call, and persist EXECUTING before invoking it. Abort the operation on storage errors (fail closed).
3. After verified commit, persist COMMITTED. After interruption or ambiguous outcome, persist UNCERTAIN and prompt for manual reconciliation; never retry automatically.
4. Confirm no regression to current capability permission gates, Emergency Stop, mutation idempotency or privacy.
5. Expand MioBench with crash/restart and concurrent project tests; run all CI gates and live deployment acceptance before claiming production readiness.
