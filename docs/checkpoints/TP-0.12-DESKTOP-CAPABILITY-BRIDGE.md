# TP 0.12 — Desktop Capability Bridge & Secure IPC Service Adapters

Status: IMPLEMENTED / GATE 1 PASSED / GATE 2 PASSED / FINAL VALIDATION PENDING
Branch: `milestone/mio-web-lab-tp-0.12`
Base: `refactor/mio-web-lab-v2`
PR: #13
Gate 1 validated head: `57953195e7c2a50c0320188cdf4303fd7b6c37de`
Gate 2 validated checkpoint head: `c60a96bc9fca84f9d0308238429a252b665fae78`

## Objective

Connect narrowly scoped Electron desktop capabilities to MIO's existing Capability -> Resource -> Permission -> Sandbox -> Validation path without exposing unrestricted Node.js, raw filesystem paths, generic shell/process execution, or destructive OS authority to the renderer or agent layer.

## Desktop filesystem authority model

The previous renderer contract accepted arbitrary filesystem paths. TP 0.12 replaces it with explicit workspace authority:

```text
User native folder picker
  -> Electron main process
  -> canonical realpath
  -> WorkspaceSandbox authority registry
  -> opaque workspaceId returned to renderer
  -> relative-path request only
  -> CapabilityRegistry
  -> SecureServiceGateway
  -> scoped PermissionEngine grant
  -> resource budget
  -> sandbox
  -> typed preload IPC
  -> main-process canonical containment re-check
  -> bounded read/list result
```

The absolute workspace root never becomes agent/service input and is not returned to the renderer by the authorization call.

## WorkspaceSandbox

`WorkspaceSandbox` holds authorized roots only inside Electron main-process memory. It provides:
- opaque random workspace IDs;
- canonical `realpath` root registration;
- relative-path-only resolution;
- lexical containment checks before filesystem access;
- canonical containment checks after `realpath` to block symlink breakout;
- bounded UTF-8 text reads (default 2 MiB);
- rejection of null-delimited/binary-like text payloads;
- bounded directory listing (default 1000 entries);
- per-workspace and global revocation.

Workspace authority is session authority and is not persisted for replay after restart.

## Narrow IPC bridge

Legacy raw-path IPC primitives were removed from the active channel set. The preload bridge exposes only:
- `authorizeWorkspace()`;
- `revokeWorkspace(workspaceId)`;
- `readWorkspaceText({ workspaceId, relativePath })`;
- `listWorkspace({ workspaceId, relativePath })`.

There is no renderer-exposed arbitrary write, delete, shell, process, or absolute-path primitive in TP 0.12.

Every registered IPC invocation is checked against the current main window and its top frame before dispatch. Untrusted/subframe senders are rejected.

## BrowserWindow hardening

TP 0.12 preserves `contextIsolation: true` and `nodeIntegration: false`, and changes `webSecurity` to `true`.

Additional controls:
- new-window requests are denied;
- top-level navigation is limited to the explicit Vite development URL or local `file://` application content;
- F12 DevTools shortcut is development-only.

`sandbox` remains `false` because the current preload is emitted as CommonJS with a relative module dependency. Enabling Electron renderer sandbox safely requires a bundled/sandbox-compatible preload architecture; this limitation is explicit rather than hidden.

## Capability model

Two narrow desktop services are introduced:
- `service.desktop.workspace.read-text`;
- `service.desktop.workspace.list`.

They remain `UNAVAILABLE` in the default web registry and become `AVAILABLE` only through `createDesktopCapabilityRegistry()`.

Generic `service.filesystem` remains `UNAVAILABLE`, including on desktop. `service.os` remains `UNAVAILABLE`. No generic filesystem or OS authority is granted.

## Scope binding

`SecureServiceGateway` now supports `validateScope(input, context)` so the resource/path represented to CapabilityRegistry and PermissionEngine must match the actual service input.

For desktop workspace services:
- `context.resourceId` must equal `input.workspaceId`;
- `context.path` must equal `input.relativePath`.

The binding is checked before authorization execution and re-checked inside the sandbox execution boundary, closing a confused-deputy path.

## CI hardening

The Validation Gate now compiles both runtimes:

```text
npm run lint
npm run build
npm run build:electron
npm test
```

Electron main/preload TypeScript can no longer regress while web-only CI remains green.

## Validation

### Gate 1
- dependency install/audit: PASS — 0 vulnerabilities;
- lint: PASS — 0 errors, 39 warnings before cleanup;
- web TypeScript + Vite production build: PASS;
- Electron main/preload TypeScript build: PASS;
- total automated validations: **103/103 PASS**.

### Gate 2 — checkpoint head `c60a96bc9fca84f9d0308238429a252b665fae78`
- dependency install/audit: PASS — 0 vulnerabilities;
- lint: PASS — **0 errors, 38 warnings**;
- web build: PASS;
- Electron build: PASS;
- total automated validations: **103/103 PASS**;
- original system/security suite: **23/23 PASS**;
- all TP 0.1–0.11 validations remain green.

TP 0.12 tests verify opaque authority IDs, bounded in-root reads, absolute-path rejection, parent traversal rejection, symlink breakout rejection, size/list limits, revocation, runtime-specific capability availability, generic filesystem/OS denial, end-to-end SecureServiceGateway execution, and service input/scope mismatch rejection.

## Build observation

Gate 2 output:
- initial application JS: ~292.14 kB minified / ~88.65 kB gzip;
- ChatStudio: ~32.52 kB / ~10.06 kB gzip;
- TaskScheduler: ~3.76 kB / ~1.53 kB gzip;
- TaskMonitor: ~12.29 kB / ~3.28 kB gzip;
- Studio3D remains ~545.07 kB / ~136.07 kB gzip and remains the known large lazy chunk.

## Known boundaries

- Desktop workspace read/list infrastructure is implemented, but the Files UI is not yet a complete authorized workspace browser.
- Workspace authority is in-memory and requires explicit re-authorization after restart.
- No desktop write/delete/move/rename capability is enabled.
- No shell/process execution capability is enabled.
- Electron renderer sandbox remains disabled pending a bundled/sandbox-compatible preload architecture.
- Service invocations still consume the privileged tool-call budget.
- The execution ledger remains audit metadata rather than a cryptographically tamper-evident ledger.
- Existing UI lint warnings, Vite config-loader warning, and Studio3D chunk-size warning remain separate technical debt.

## Definition of Done

- [x] Replace raw absolute-path IPC with workspace authority model
- [x] Opaque workspace IDs held by Electron main process
- [x] Canonical root and target `realpath` validation
- [x] Parent traversal protection
- [x] Symlink breakout protection
- [x] Bounded text read and directory listing
- [x] Workspace revocation
- [x] Sender/main-frame IPC validation
- [x] Narrow typed preload bridge
- [x] `webSecurity: true`
- [x] New-window/navigation restrictions
- [x] Runtime-specific desktop capability registry
- [x] Desktop read/list SecureServiceGateway adapters
- [x] Input-to-approved-scope binding
- [x] Generic filesystem/OS capability remains unavailable
- [x] Electron build added to CI
- [x] Gate 1: 103/103 PASS
- [x] Gate 2: 103/103 PASS
- [ ] Final validation on this documentation head
- [ ] PR ready for review
- [ ] Merge to `refactor/mio-web-lab-v2`

## Recommended next milestone

TP 0.13 should implement **Project Workspace File Browser & Read-Only Knowledge Ingestion**: connect authorized workspace authority to the Files/Project UI, expose user-visible authorized roots, provide bounded read/list and controlled document ingestion, quarantine untrusted document content before memory promotion, and preserve web-runtime fallback. Write/delete/move/rename should remain a later milestone with preview, rollback/trash, explicit permission semantics, and destructive-operation tests.
