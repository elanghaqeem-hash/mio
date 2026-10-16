# MIO-PRV-10.04b — Electron durable mutation checkpoints

Status: FEATURE BRANCH — GitHub CI acceptance pending. Desktop-only integration.

## Scope completed
- Electron main-process checkpoint storage in `electron/ipc/durableMutationCheckpoints.ts`.
- Workspace-scoped filename is SHA-256 of workspace ID; strict transaction and operation IDs; metadata only.
- Atomic replacement: exclusive temporary file under userData, write, fsync file, rename, fsync containing directory. Any storage failure blocks the mutating operation.
- The desktop IPC workspace mutation handler reserves all operations before starting; persists EXECUTING before invoking workspaceSandbox.mutate; writes COMMITTED after the existing audit journal's successful operation entry. A failed/ambiguous execution is UNCERTAIN and never automatically retried.
- Duplicate transaction replay is denied. Reopening a checkpoint archive shows in-flight EXECUTING as UNCERTAIN, while COMMITTED remains terminal.
- Corrupt archive/unknown field/duplicate identity fails closed. Bounded 250 records per workspace, without unsafe eviction.
- Regression tests cover process restart by reopening the store, tampering rejection, replay rejection and metadata-only storage.

## Security and operational limitations
- This implements desktop workspace file mutations only, **not all CapabilityProtocol tools, model execution, voice or other creative mutations**.
- There is no authenticated multi-user encryption or journal cryptographic signing. A local attacker with write access to the userData directory could tamper with or delete the files. SHA-256 filename hashing is isolation by path, NOT an integrity guarantee.
- Crash simulation is store-reinitialization, NOT a process-kill or power-loss test. Full production acceptance requires crash fault injection and OS-specific fsync/rename verification, including Windows.
- The existing DesktopMutationJournalStore remains a separate source of evidence. It is not modified or discarded.
- A checkpoint that is PREPARED or UNCERTAIN cannot be replayed through the original transaction ID; manual inspection and a new approved transaction are needed. No automatic reconciliation against the external filesystem is attempted.
- Checkpoint retention currently fails closed at the cap; implement an audited archival process before broad production use.
- Desktop web/browser builds cannot use this Electron-only store.

## Next
1. Integrate a structured read-only checkpoint inspection UI/API behind trusted Electron IPC and permission checks, with no destructive resolution action.
2. Introduce durable encrypted or integrity-protected storage, safe archival, and crash/power-loss fault injection.
3. Carry trace IDs and checkpoints across other governed mutating capabilities.
4. Establish MioBench end-to-end production acceptance before declaring PRV-10 production ready.
