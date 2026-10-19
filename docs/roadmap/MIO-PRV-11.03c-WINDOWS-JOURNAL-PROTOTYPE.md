# MIO PRV-11.03c — Windows Checkpoint Append-Only Journal Prototype

## Implemented

A **non-activated**, Node-only proof-of-concept journal uses one existing, **operator-preprovisioned** file rather than repeated atomic file replacement and directory entry publication. Each journal record has a fixed magic/version, bounded payload length, SHA-256 chain over previous record digest + payload, and verified JSON content. Append writes at explicit offsets, fsyncs the file, then rereads the complete chain. Journal open and append both refuse corrupted history, incomplete tails, oversized payloads, unexpected file types and missing files. No automatic truncation, recovery, rollover or replay.

Native Windows CI exercises record append, reopening, hash tampering, missing preprovisioned file, and a torn tail. Linux CI runs the same pure storage tests. No renderer API, capability permission, or production runtime activation is added.

## Hard security/durability boundaries

- This **is not** a replacement `MioCheckpointStorage` or transactional checkpoint implementation. It is intentionally **not** wired to `ExclusiveNodeCheckpointRuntime`. The Windows runtime continues to return `CHECKPOINT_DURABILITY_UNSUPPORTED_WINDOWS` before creating a lock or effect.
- File `fsync` may persist *file contents* but does **not** establish physical power-loss-safe publication of the journal's own directory entry. An externally protected **preprovisioned** journal lifecycle, platform-specific file handle management, or reviewed Win32 native durability journal remains to be designed and proven.
- Hash chaining detects inadvertent corruption, but it is **not cryptographic authentication** against an attacker who can rewrite the full journal. Root trust, ACL policy, append-only authority and platform-specific lock must be independently validated.
- Prototype does not enforce interprocess writer exclusivity. It must not be used with multiple writers, automatic tail repair, or as a runtime commit signal.
- Windows full process-crash tests, physical power-loss tests and Electron native GUI tests remain outstanding.

## Next steps

Prototype a **preprovisioned per-workspace journal manifest and exclusive OS-level writer authority**, define monotonic sequence and linkage to `MioCheckpointPersistence` with correct admission/commit invariants, and test using native Windows process death. Obtain actual durability evidence (including filesystem/volume policy and metadata publication) before allowing Windows runtime activation.
