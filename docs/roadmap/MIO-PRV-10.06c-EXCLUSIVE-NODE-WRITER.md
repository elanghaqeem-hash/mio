# MIO-PRV-10.06c — Exclusive Node checkpoint writer admission

Status: bounded opt-in implementation, pending CI.

## Implemented

- `createExclusiveNodeCheckpointRuntime(absoluteUserDataRoot)` builds the existing durable `NodeFileCheckpointStorage` and `PersistentMutationCheckpointGate` only after atomically acquiring an exclusive writer lock in the checkpoint directory.
- The lock is created with `O_EXCL`, mode 0600, fsynced, and its containing directory is fsynced. A second runtime using the same root fails closed.
- Lock is **never automatically reclaimed** after a crash. Operator must review checkpoint history and confirm no previous process is still writing before lock removal.
- `close()` exists for orderly shutdown after all work has finished; identity checks prevent unlinking a replaced lock. Calling `close()` while tasks are still mutating violates this API contract and must be prevented by the embedding runtime.
- Automated tests cover duplicate owner rejection, orderly handoff, retained lock, lock replacement and committed checkpoint durability.

## Not yet complete

- This factory is **not automatically activated** in the renderer or web runtime. The current AgentOrchestrator creates its protocol inside shared frontend code; importing Node filesystem modules there would be unsafe and break browser bundling.
- A trusted Electron main-process or Node sidecar must own this factory, route governed capabilities to that process, and manage startup/shutdown plus STOP/cancellation. This has **not** been wired into the application.
- The lock is a coarse storage-root single-writer mechanism, not a distributed lock. Crash leaves a stale lock requiring manual recovery. OS-specific file-lock and power-loss behavior, encryption and tamper-resistant records are not verified.
- No multi-process cross-engine execution, replay or automatic resolution. No production deployment.

## Next

1. Define authorized Electron-main IPC for governed capability dispatch to prevent renderer bypass.
2. Ensure in-flight task draining before orderly lock release; test abrupt process termination.
3. Add main-process startup activation only after exclusive writer ownership and permission / STOP integration have been verified.
4. Run Windows/Linux/macOS MioBench crash and recovery tests before release.
