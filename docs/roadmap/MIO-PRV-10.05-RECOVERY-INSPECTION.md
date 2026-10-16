# MIO-PRV-10.05 — Read-only recovery inspection

Scope: Electron Desktop file-mutation checkpoints only.

The Electron main process exposes a read-only, workspace-authorized recovery inspection through `FS_INSPECT_WORKSPACE_RECOVERY` and the typed preload API `mioDesktop.inspectWorkspaceRecovery(workspaceId)`.

**Authorization:** main-frame-only IPC gateway already enforced by main.ts, additionally checks that the caller's workspace was explicitly authorized during the current desktop session.

**Semantics:** COMMITTED → NO_ACTION, PREPARED → NOT_STARTED_REVIEW, EXECUTING or UNCERTAIN → MANUAL_REVIEW_REQUIRED. The last two never trigger a retry. In-flight EXECUTING is presented as UNCERTAIN on restart. Results contain opaque transaction and operation IDs, no file paths, prompt contents or credentials.

**Corruption:** invalid or unreadable checkpoint archives fail closed. No destructive actions, state cleanup, rollback, replay or status modification are exposed to the renderer.

**Known gaps:** No visible panel has been created in the desktop UI yet. The API is consumable by an authorized recovery review UI. Existing workspace IDs are ephemeral between sessions; the user must authorize the workspace again. No permission to force retry/resolve is implemented. The archive is not cryptographically authenticated, and the platform has not yet passed actual Windows power-loss fault injection.

**Acceptance:** TypeScript web and Electron builds, security suite and full test harness including recovery assessment; CI before merge. Further phases must add guided read-only UI, integrity checks and reconciliation evidence before any explicit resolution action.
