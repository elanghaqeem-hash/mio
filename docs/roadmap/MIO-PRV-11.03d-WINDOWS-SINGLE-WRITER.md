# MIO PRV-11.03d — Windows Journal Single-Writer Coordination Prototype

## Implemented
- An explicit, non-production journal-writer coordinator obtains an exclusive **lock-file** using `O_EXCL` in the same directory as an **already provisioned** journal file. A second concurrent caller is denied.
- The full hash-chained journal is validated before appending. Any malformed history, failed append, or uncertain filesystem error quarantines the writer and prevents normal lock release.
- Graceful close verifies that the lock still refers to the acquired file and removes it only after the open descriptor is closed. Stale locks are never reclaimed automatically.
- Unit regressions cover contention, orderly release, stale-lock rejection, corrupted journal quarantine and inability to write after a failure.
- **Native Windows subprocess tests** launch independent Node processes: one holds a lock while a second must be denied; after orderly release a new process may acquire it; abrupt `process.exit(77)` leaves a stale lock and blocks takeover.

## Explicit restrictions
- This is **not** a trusted durable backend or transactional `MioCheckpointStorage` and does NOT integrate with `ExclusiveNodeCheckpointRuntime`. Windows runtime is still blocked by `CHECKPOINT_DURABILITY_UNSUPPORTED_WINDOWS`.
- An `O_EXCL` lock proves best-effort writer coordination on the tested filesystem while lock metadata exists, **not** power-loss-safe publication of a newly created directory entry. The lock may not survive physical power loss in a verifiably safe way.
- Journal must be preprovisioned in a trusted directory. File `fsync`, hash chains and OS runner process tests are **not** evidence of durable commit to disk under real power failure.
- No full Windows crash/recovery execution, no model/voice/3D pipeline activation, no auto lock stealing or tail repair, and no production deployment.

## Next acceptance gate
A future reviewed Windows backend must establish durable namespace/metadata lifecycle (Win32 verified API, explicit protected storage volume semantics, or another justified journal protocol), add authenticated workspace control, and pass the four full crash/restart cases and physical power-loss acceptance before activation. Until then, keep the Windows creative runtime fail-closed.
