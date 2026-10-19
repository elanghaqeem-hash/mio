# MIO PRV-11.03j — Validated Windows Journal Mutation Transitions

The non-production Windows journal prototype now has a strictly typed **logical mutation transition writer**. It uses the existing exclusive writer lease and append-only hash-chain journal, validates the *entire* logical history before any append, and constructs the next sequence number and global `previousDigest` itself. The caller cannot submit arbitrary sequence numbers, forged prior digests, or skip PREPARED → EXECUTING → COMMITTED transitions. PREPARED/EXECUTING may also transition to terminal UNCERTAIN; terminal requests cannot be replayed. Multiple request histories may interleave while preserving a single global digest chain.

Unexpected corruption or append/inspection errors quarantine the writer and preserve its lock for manual review. Invalid user input or denied phase transitions do not append a record. Tests cover complete commit, interleaved histories, invalid phases, terminal uncertainty, restart replay denial, and pre-existing corrupt logical history.

## Safety boundary

**This is not a production checkpoint backend.** It does not activate Windows creative runtime or replace `CHECKPOINT_DURABILITY_UNSUPPORTED_WINDOWS`. A logically committed journal is not proof of physical power-loss durability, authentic user approval, or that the creative side effect persisted. The journal remains susceptible to local adversarial path replacement on Windows without native file-ID/handle guarantees. No auto-repair, truncation, stale lock reclamation, or automatic retry. Native Windows handle, ACL, power-cut and physical-durability validation remain required. No deployment.
