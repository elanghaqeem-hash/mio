# MIO PRV-11.03b — Windows durable backend feasibility probe

## Purpose and result interpretation

Windows GitHub Actions previously confirmed that Node directory fsync fails with EPERM while constructing the trusted checkpoint writer. PRV-11.03a therefore deliberately **disables trusted creative checkpoint activation on Windows** rather than weaken its durability guarantee.

This increment adds a separate, native Windows filesystem capability probe. It uses an isolated temporary folder, exercises:
- exclusive file creation and file fsync;
- reopening the flushed lock content;
- same-volume rename following file fsync;
- replacing an existing checkpoint file by same-volume rename;
- attempting to open and fsync its containing directory, reporting the real platform error.

The directory publication test is **diagnostic**: its failure is recorded, never silently converted into evidence that a checkpoint survives power loss. CI fails if required *file-level* primitives fail, and does not classify file-level success as durable metadata publication.

## Exit criteria for a future actual Windows backend

1. Implement and review a Win32-native persistence protocol that provides verifiable metadata/directory publication guarantees or an explicitly documented alternative atomic durable journal; Node file-only flush/rename is not sufficient by itself.
2. Verify exclusive writer coordination, stale-lock handling, no-replay after process kill and ambiguous checkpoint recovery in the full four-test Windows subprocess suite, not merely this probe.
3. Test Windows filesystem specifics, ACL isolation and NTFS volume behavior; document what happens on unsupported filesystems/storage.
4. Verify native Electron dialogs, shutdown/STOP and real Studio3D integration.
5. Do not turn on Windows creative execution or claim PRV-12 production readiness from this probe.

**No production runtime behavior is changed in PRV-11.03b.**
