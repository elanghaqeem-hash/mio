# MIO PRV-10.06h — Trusted Electron Read-Only Capability Bridge

This is the first narrowly allowlisted step toward Electron-main capability dispatch; it is **not** the full Unified Capability Protocol or cross-engine mutation activation.

The desktop main process now accepts a versioned read-only request through a secure Electron main-frame IPC channel and typed preload API. Only three capabilities are exposed: `desktop.workspace.list`, `desktop.workspace.read-text`, and `desktop.recovery.inspect`. The implementation delegates to the existing sandbox and durable recovery inspector rather than creating new filesystem authority.

Admission enforces exact request fields, `L0_OBSERVE`, capability allowlist, an explicitly authorized session workspace, relative path bounds, and the existing sticky STOP. Authorization and STOP are checked again after asynchronous execution, preventing stale successful responses if authority changes during a read. Errors are generic; no raw filesystem path or exception is returned.

**Not supported:** mutations, creative execution, model calls, voice, remote/network capabilities, generalized renderer-supplied executors, auto-replay, bypass of the existing mutation approval/checkpoint architecture. This bridge does not instantiate the shared `CapabilityProtocol`; adding that requires a separately verified server-side registry and authenticated permission context. The declared L0 field is a contract gate, not an identity-verified user permission token.

Acceptance requires four CI workflows and regression tests. No production deployment or claim that all engines are integrated.
