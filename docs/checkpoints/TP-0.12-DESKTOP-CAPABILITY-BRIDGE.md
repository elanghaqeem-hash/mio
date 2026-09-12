# TP 0.12 — Desktop Capability Bridge & Secure IPC Service Adapters

Status: IMPLEMENTED / GATE 1 PASSED / GATE 2 PENDING
Branch: `milestone/mio-web-lab-tp-0.12`
Base: `refactor/mio-web-lab-v2`

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

Workspace authority is session authority. It is revoked when the window closes or the explicit quit IPC path is used and is not persisted for replay after restart.

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

Additional navigation controls:
- new-window requests are denied;
- top-level navigation is limited to the explicit Vite dev URL during development or local `file://` application content;
- F12 DevTools shortcut is development-only.

`sandbox` remains `false` in this milestone because the current preload is emitted as CommonJS with a relative module dependency. Enabling Electron renderer sandbox safely requires bundling/restructuring preload first; TP 0.12 documents this rather than enabling a flag that could silently break the desktop runtime.

## Capability model

Two narrow desktop services are introduced:
- `service.desktop.workspace.read-text`;
- `service.desktop.workspace.list`.

They are `UNAVAILABLE` in the default web capability registry and only become `AVAILABLE` through `createDesktopCapabilityRegistry()`.

Generic `service.filesystem` remains `UNAVAILABLE`, including on desktop. `service.os` remains `UNAVAILABLE`.

No generic filesystem or OS authority is granted by this milestone.

## Scope binding

`SecureServiceGateway` now supports `validateScope(input, context)` so the resource/path represented to CapabilityRegistry and PermissionEngine must match the actual service input.

For desktop workspace services:
- `context.resourceId` must equal `input.workspaceId`;
- `context.path` must equal `input.relativePath`.

This closes a confused-deputy path where a benign approved scope could otherwise be paired with different service input at execution time. The scope binding is re-checked again inside the sandbox execution boundary.

## CI hardening

The MIO Validation Gate now compiles both runtimes:

```text
npm run lint
npm run build
npm run build:electron
npm test
```

Electron main/preload TypeScript can no longer regress while web-only CI remains green.

## Validation Gate 1

Validated head before checkpoint cleanup: `57953195e7c2a50c0320188cdf4303fd7b6c37de`.

Results:
- dependency install/audit: PASS — 0 vulnerabilities;
- lint: PASS — 0 errors, 39 warnings at that head;
- web TypeScript + Vite production build: PASS;
- Electron main/preload TypeScript build: PASS;
- total automated validations: **103/103 PASS**;
- original system/security suite: **23/23 PASS**;
- all TP 0.1–0.11 suites remain green.

New TP 0.12 validations verify:
- workspace authorization returns opaque ID without absolute root disclosure;
- bounded text read works inside authorized workspace;
- absolute paths are rejected;
- parent traversal is rejected;
- symlink breakout is rejected after canonical resolution;
- file-size bounds are enforced;
- directory-entry bounds are enforced;
- revoked workspace authority cannot be reused;
- desktop workspace capabilities remain unavailable in web registry;
- desktop registry enables only narrow workspace services;
- generic filesystem and OS capability remain unavailable;
- desktop read flows through capability/resource/permission/sandbox/scope/output-validation gates;
- actual service input cannot differ from the approved resource/path scope.

A small cleanup after Gate 1 removed the obsolete `isQuitting` warning introduced by the main-process refactor. Gate 2 must validate the checkpoint head after that cleanup.

## Build observation

Gate 1 output:
- initial application JS: ~292.14 kB minified / ~88.65 kB gzip;
- ChatStudio: ~32.52 kB / ~10.06 kB gzip;
- TaskScheduler: ~3.76 kB / ~1.53 kB gzip;
- TaskMonitor: ~12.29 kB / ~3.28 kB gzip;
- Studio3D remains ~545.07 kB / ~136.07 kB gzip and remains the known large lazy chunk.

## Known boundaries

- Desktop workspace read/list infrastructure is implemented, but current Files UI is not yet refactored into a complete project-file browser using these services.
- Workspace authority is in-memory and requires explicit re-authorization after restart.
- No desktop write/delete/move/rename capability is enabled in TP 0.12.
- No shell/process execution capability is enabled.
- Electron renderer sandbox remains disabled pending a bundled/sandbox-compatible preload architecture.
- Service calls continue to consume the privileged tool-call budget introduced earlier.
- The execution ledger remains audit metadata rather than a cryptographically tamper-evident ledger.
- Existing UI lint warnings and the Studio3D chunk-size warning remain separate known technical debt.

## Definition of Done

- [x] Replace raw absolute-path IPC with workspace authority model
- [x] Opaque workspace IDs held by Electron main process
- [x] Canonical root and target `realpath` validation
- [x] Parent traversal protection
- [x] Symlink breakout protection
- [x] Bounded text read
- [x] Bounded directory listing
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
- [x] Gate 1: 103/103 tests PASS
- [ ] Gate 2 on checkpoint head
- [ ] PR ready for review
- [ ] Merge to `refactor/mio-web-lab-v2`

## Recommended next milestone

TP 0.13 should implement **Project Workspace File Browser & Read-Only Knowledge Ingestion**. It should connect the approved desktop workspace authority to the Files/Project UI, expose explicit user-visible authorized roots, allow bounded read/list and controlled document ingestion, quarantine external/untrusted document content before memory promotion, and preserve web-runtime fallback. Write/delete/move/rename should remain a separate later milestone with preview, rollback/trash, L3/L4 permission semantics, and dedicated destructive-operation tests.
