# Creative Engine 1.1 — Shared Studio Workspace

## Scope

This checkpoint connects the five existing native studios to the Creative Document Kernel merged in PR #44. It deliberately preserves the existing render/audio previews while replacing component-only document mutation with the shared command, history, autosave, and persistence path.

## Delivered

- Shared React studio controller backed by `CreativeDocumentKernel` and `CreativeDocumentRepository`.
- Deterministic workspace IDs so a studio reopens the same document after remount/restart.
- Command-based state projection that keeps normalized nodes and legacy-compatible data synchronized.
- Shared visible workspace toolbar with revision, dirty/recovered/error state, undo, redo, and explicit save.
- Kernel adoption by 3D Modelling, Animation, Graphic Design, SFX, and Music studios.
- Animation playhead remains transient UI state, preventing playback frames from polluting document history.
- Recovery snapshots are preferred only when newer than the last durable save.

## Capability matrix

| Capability | 3D | Animation | Graphic | SFX | Music | Drawing | Photo | 2D/Motion |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Shared document schema | Ready | Ready | Ready | Ready | Ready | Ready | Ready | Ready |
| Command-based editing | Ready | Ready | Ready | Ready | Ready | Schema only | Schema only | Schema only |
| Undo/redo | Ready | Ready | Ready | Ready | Ready | Not exposed | Not exposed | Not exposed |
| Autosave/recovery | Ready | Ready | Ready | Ready | Ready | Not exposed | Not exposed | Not exposed |
| Existing local preview | WebGL | Structural | Canvas | WebAudio | WebAudio | Not built | Not built | Not built |
| Cloud/AI generation | Not claimed | Not claimed | Not claimed | Not claimed | Not claimed | Not claimed | Not claimed | Not claimed |

## Compatibility and security

- Existing `.mio3d`, `.mioanim`, `.mioart`, `.miosfx`, and `.miomusic` state remains represented in `metadata.legacyData` and normalized nodes.
- `.miomotion`, `.miodraw`, and `.miophoto` are recognized without renaming existing modes or asset identifiers.
- Web persistence remains on the configured IndexedDB-backed `StorageProvider`; desktop remains behind the existing controlled runtime boundary.
- Provider secrets are not written into creative documents.
- Agent-originated mutations still require the outer policy, permission, sandbox, validation, and audit path before entering the command bus.

## Validation gate

- Five studios must edit, undo, redo, save, and reopen through the shared repository.
- Lint, TypeScript, web/Electron build, full tests, release smoke, and CI must pass.

## Next checkpoint

Build the shared dockable workspace layout, then deliver the 3D Modelling + Animation vertical slice with Blender/Prisma3D and Source Filmmaker-style interaction patterns.
