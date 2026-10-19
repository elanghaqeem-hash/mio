# MIO PRV-10.06k — Trusted Node Creative Execution Foundation

## Implemented

- A **Node-only** trusted creative executor composes the existing exclusive single-writer durable checkpoint runtime with a privileged, explicitly injected authorization callback and a privileged deterministic creative adapter.
- The command schema is tightly bounded to `3D`, `GRAPHIC`, or `DRAWING` plus a named template and opaque task/project/request identities. Arbitrary user-supplied code, shell commands, template scripts, and filesystem paths are not supported.
- Each request must pass independently verified authorization **before** durable PREPARED/EXECUTING checkpoint admission; the executor is invoked only after successful admission. A failed checkpoint denies work and quarantines the runtime.
- Successful effects receive a COMMITTED checkpoint before reporting success. Errors or ambiguous side effects become UNCERTAIN, with no automatic retry. Repeated IDs remain blocked both within the current session and across restarts.
- STOP stops new admission, does not falsely claim an in-flight side effect was cancelled, and permits in-flight checkpoint settlement. Graceful close refuses while mutations are in progress.
- Node disk-backed regression tests exercise actual checkpoint persistence, authorization rejection, STOP during approval, STOP after an effect, duplicate replay, and uncertain failure.

## Release limitations

- **No runtime activation**: this is a trusted Node-side composition root and execution contract. It is NOT imported into Electron renderer, nor connected to `AgentOrchestrator`, `CreativeOrchestrator`, or an IPC handler. No GUI button has been activated by this change.
- **No real creative engine adapter yet**: the privileged callback must be implemented and constrained to a small, reviewed template registry. The tests use mock deterministic callbacks to verify lifecycle semantics, not actual rendered scene output.
- **Approval is a trusted callback interface, not itself a verified authorization implementation**. It must be wired in the privileged process and independently validate user consent/project ownership.
- Single-writer lock still requires manual remediation after a crash. Disk records are not cryptographically authenticated. No Windows/macOS/Linux power-loss or real process-kill tests.
- The web-only runtime remains unchanged. This does not enable unrestricted creative, model, voice or arbitrary file mutations.
- No production deployment performed.

## Next stage

1. Define a reviewed native template allowlist and source-grounded project/asset persistence adapter for one deterministic creative mode.
2. Implement user approval and cancel/STOP handshake in the trusted Electron-main process, never accept untrusted renderer-supplied authorization bits.
3. Run real operating-system crash and restart fault injection with MioBench before activating user-facing creative operations.
