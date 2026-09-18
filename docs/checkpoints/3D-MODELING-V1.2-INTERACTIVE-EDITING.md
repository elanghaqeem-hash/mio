# 3D Modeling V1.2 — Interactive Mesh Editing

## Delivered
- Direct face picking in the WebGL viewport using Three.js Raycaster.
- Triangle hits resolve back to stable Mio face IDs through the V1.1 projection map.
- Click replaces face selection; Shift+click toggles additive face selection.
- Empty viewport click clears selection without changing component mode.
- Selection behavior is isolated in deterministic helpers with regression tests.
- Edit Mode uses a crosshair cursor and remains document-state authoritative.

## Architecture
Raycasting is an input adapter only. It resolves a rendered triangle to a stable Mio topology ID; renderer geometry is never edited as authoritative state.

## Next checkpoint
- visual selected-face overlay;
- vertex point and edge line overlays;
- vertex/edge viewport picking;
- transform gizmo and drag transaction history;
- region extrusion and topology operations.
