# MIO PRV-10.06e — Desktop mutation concurrency guard

The existing Electron mutation executor awaited asynchronous file operations without an in-flight workspace guard. Two IPC invocations for a single authorized workspace could overlap, and the user could revoke workspace authority while a mutation was active.

This change introduces `DesktopWorkspaceMutationLease`. The main-process handler synchronously acquires the per-workspace lease before consuming the one-use approval token or reserving durable checkpoints. A second request against that workspace fails immediately (without using its approval) with `WORKSPACE_MUTATION_ALREADY_ACTIVE`. The lease is released in `finally`, including on checkpoint or journal failures; unrelated workspaces remain independent. Workspace revocation refuses to proceed while the lease is active.

Regression tests cover overlapping executions, workspace independence, idempotent release and static handler integration.

**Security boundaries:** This protects concurrency inside a single Electron main process; it does not add an interprocess distributed lock or make raw file actions transactional. A crash during mutation remains UNCERTAIN and is not automatically retried. Emergency STOP, cancellation between file operations, user-facing recovery UI and Node cross-engine checkpoint activation require separate verification. No production deployment.
