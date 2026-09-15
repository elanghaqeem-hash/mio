# Creative Engine 1.0 — Shared Document Kernel

## Scope

This checkpoint starts the native Creative Engine update from the reconciled `main` baseline (`7bfe17b`). It introduces the shared document foundation before studio-specific UI expansion.

## Delivered

- Normalized, versioned `CreativeDocument` schema for 3D, animation, graphic, SFX, music, 2D motion, drawing, and photo documents.
- Stable node and asset identifiers with reciprocal tree validation and cycle detection.
- Serializable command model for create, update, delete, restore, reorder, selection, document update, and atomic batch operations.
- Append-only operation audit with revision numbers plus in-session undo and redo.
- Shared repository over the existing runtime `StorageProvider`, supporting IndexedDB on web and the configured desktop/runtime storage boundary.
- Recovery snapshots and explicit durable-save flow.
- Non-destructive migration adapters for `.mio3d`, `.mioanim`, `.mioart`, `.miosfx`, and `.miomusic` that retain legacy IDs and data.

## Compatibility rules

- Existing studio file extensions and object identifiers are preserved.
- Existing studio UI remains available during kernel adoption.
- New creative persistence uses the isolated `creative` namespace and does not alter existing project, memory, settings, or runtime records.
- AI-originated changes must enter the same command envelope; policy, permission, STOP MIO, validation, and audit gates remain outside and above the kernel.

## Exit gate for this checkpoint

- TypeScript build and lint pass.
- Existing validation suite remains green.
- Kernel tests prove undo/redo, atomic failure, subtree restoration, five-format migration, save/reopen, and recovery behavior.

## Next checkpoint

Adopt the kernel in each existing studio through a shared React controller, then add the Drawing, Photo Editing, and 2D/Motion workspaces as vertical slices.
