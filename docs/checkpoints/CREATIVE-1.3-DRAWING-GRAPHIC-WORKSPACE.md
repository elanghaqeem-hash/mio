# Creative Engine 1.3 — Drawing and Graphic Workspace

## Scope

This checkpoint adds a native Drawing Studio and expands Graphic Design on the shared Creative Document Kernel. It adopts familiar layered-canvas concepts from Krita, Procreate, Figma, and Canva without copying their visual identity or claiming feature parity.

## Delivered

### Drawing Studio

- New `.miodraw` workspace exposed in the main Creative navigation.
- Pointer/stylus stroke capture with coordinates and pressure metadata.
- Brush and eraser modes, color, brush size, and local canvas preview.
- Layer creation, selection, visibility, lock, opacity, rename, and guarded deletion.
- PNG export plus shared undo, redo, autosave, recovery, and explicit save.

### Graphic Design

- Layer duplication and z-order controls.
- Locked-layer editing guard for names, text, opacity, geometry, and fill.
- Position and size inspector for x, y, width, and height.
- Existing vector-like shape/text layers, visibility, locking, local preview, and PNG export remain compatible.

## Capability matrix

| Area | Ready in 1.3 | Deferred |
|---|---|---|
| Drawing input | Pointer/stylus paths, pressure metadata | Pressure-shaped rendering, stabilization, tilt |
| Drawing brushes | Round brush, eraser, size/color | Brush engine presets, texture brushes, smudge |
| Drawing layers | Add, select, rename, opacity, visibility, lock, delete | Masks, clipping groups, blend-mode UI, selections |
| Graphic layers | Shape/text, duplicate, reorder, visibility, lock | Components, constraints, auto-layout, boolean paths |
| Graphic inspector | Position, size, opacity, fill, typography basics | Gradient editor, effects, advanced typography |
| Export | PNG | SVG/PDF, color profiles, print preflight |
| Collaboration | Local document persistence | Multiplayer cursors, comments, cloud libraries |

## Compatibility and safety

- Existing `.mioart` content keeps its current schema and document identity.
- `.miodraw` uses the already-recognized drawing document kind and the same command/history/repository path.
- Stroke and layer edits remain local; no cloud provider or hidden upload is introduced.
- Continuous pointer previews remain transient until pointer-up, producing one undoable document command per completed stroke rather than one command per sampled point.
- Provider secrets are never written to either document.

## Validation gate

- Lint, TypeScript, web/Electron builds, release checks, and the full test suite pass.
- Regression coverage confirms drawing stroke history and graphic duplicate/z-order serialization.
- GitHub Validation and Cloudflare Build pass before merge.

## Next checkpoint

Add Photo Editing with nondestructive adjustments and layer operations, followed by 2D/Motion Graphic animation on the shared timeline contract.
