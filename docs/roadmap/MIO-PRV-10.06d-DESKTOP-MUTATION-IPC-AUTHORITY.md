# PRV-10.06d — Desktop mutation IPC authority hardening

The Electron main process already used a single trusted-main-frame `secureHandle` wrapper. However the pre-existing `FS_REQUEST_WORKSPACE_MUTATION_APPROVAL` and `FS_LIST_WORKSPACE_MUTATION_AUDIT` channels were not registered in `electron/main.ts`. This update registers both behind that wrapper.

Approval, audit, and execution now require that `workspaceId` belongs to the current session's explicitly authorized workspace list. This check runs before the user approval dialog, audit access, token consumption, and durable checkpoint reservation. An arbitrary syntactically valid `ws_...` no longer reaches these operations.

The existing approval-token binding, workspace sandbox, checkpoint durability and conservative recovery behavior are unchanged. Tests register a static gateway wiring check and a live workspace authorization/revocation check.

**Limitations:** This is a prerequisite to PRV-10.06 runtime activation, not full cross-engine dispatch. It does not wire `ExclusiveNodeCheckpointRuntime` into agent execution. Multi-process locking and crash-specific MioBench testing remain outstanding. No deployment is performed.
