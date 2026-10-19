# MIO PRV-10.06j — Cross-Engine Mutation Durability Admission

## Changes

The Unified Capability Protocol now supports an explicit `mutationDurability: 'REQUIRED'` policy. In REQUIRED mode, a mutating capability (including `creative.execute`) is denied **before executor invocation** unless the trusted runtime has injected a durable `MioMutationCheckpointGate`. Read-only capabilities are not blocked by this policy.

STOP/task cancellation is rechecked **after** awaited checkpoint admission and just before executor dispatch. Any checkpoint admitted before STOP is settled conservatively as UNCERTAIN without executor dispatch; a settlement error returns UNKNOWN, never safe success or retry permission. This also addresses a race where STOP can arrive between initial authorization and completion of a durable BEGIN write.

## Scope and limits

- This is a **policy/admission foundation**; REQUIRED is intentionally opt-in. The shared AgentOrchestrator currently runs in frontend code with no authenticated durable Node backend and is not automatically switched to REQUIRED. Claiming otherwise would break existing creative flows or fabricate crash-safe storage.
- No new Electron IPC mutating capability, arbitrary executor, model provider, voice invocation, or file permission has been exposed.
- The policy alone does not guarantee a supplied adapter is truly durable. The embedding trusted Node/Electron-main runtime must validate the backend and own its process lifecycle, STOP propagation, user authorization and project-scoped lock.
- Checkpoint settlement on interruption does not mean an in-flight external effect was cancelled. No automatic replay/reconciliation or real OS power-loss test is provided.
- Regression tests cover missing backend, unaffected read-only calls, STOP during asynchronous BEGIN, and failed uncertain settlement.

## Next release gate

Build a trusted Electron-main-owned, allowlisted creative command executor with explicit user approval and durable gate; reject untrusted renderer-supplied permissions. Follow with MioBench fault-injection testing before enabling default activation. No production deployment performed in this PR.
