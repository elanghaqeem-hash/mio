# MIO-PRV-10.06b — Node durable checkpoint backend

Status: FEATURE BRANCH / CI pending. Scope: trusted single-process Node runtimes only.

## Delivered

- `NodeFileCheckpointStorage` implements the previously defined `MioCheckpointStorage` interface for a Node process with explicitly configured absolute user-data root. The browser/runtime factory does not activate it by default.
- Project-scoped SHA-256 filenames, bounded UTF-8 content, exclusive randomized temporary files, synchronous file fsync, atomic rename and directory fsync. Any I/O failure propagates, causing `PersistentMutationCheckpointGate` to deny the capability or quarantine an ambiguous execution.
- Rejects invalid project IDs and unsafe symlinked files; not a general filesystem browsing interface.
- Real filesystem regression tests verify commit round-trip, restart quarantine of in-flight mutation, cross-project isolation, symlink rejection, corrupted checkpoint failure, oversized writes and idempotency.
- Existing Electron workspace mutation checkpoint backend remains separate and authoritative; no migration or silent overlay.

## Safety and limitations

- **Not multi-process safe.** Two runtimes using the same project directory can overwrite each other's archives because the backend lacks locking / compare-and-swap; it must run with exclusive single-writer authority. It is not installed in the Electron renderer or deployed to Cloudflare Workers.
- SHA-256 filename hashing is not cryptographic integrity protection. A local attacker with filesystem write access can corrupt, replace or delete an archive; add authenticated persistence and a trusted immutable journal before multi-tenant use.
- A new directory after data deletion is indistinguishable from an uninitialized store. Trusted storage ownership, secure root configuration, backup and tamper-evident existence records remain necessary for production.
- Directory sync behavior is platform dependent, particularly on Windows. A failure is not ignored, but successful desktop power-loss recovery needs OS-specific verification.
- No automatic retry, rollback, or reconciliation of external side effects. Existing checkpoint/permission gates and mutation UNKNOWN semantics apply.
- Tests do not constitute process-kill or power-loss fault injection.

## Next acceptance criteria

- Wire an explicit trusted Node/Electron-main startup configuration and single-writer lock into the cross-engine CapabilityProtocol gate, without exposing file access to renderer.
- Crash injection during PREPARED, EXECUTING, COMMITTED; test Windows/macOS/Linux fsync semantics.
- Authenticated records, durability health checks, bounded retention and a human reconciliation flow.
- Real-world MioBench tests across creative, model, voice and file pathways; production verification separately from CI.

Deployment: NOT performed.
