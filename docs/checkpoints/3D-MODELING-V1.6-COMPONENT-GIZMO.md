# 3D Modeling V1.6 — Component Transform Gizmo

## Delivered
- TransformControls attached to a temporary selection-pivot proxy in Edit Mode.
- Vertex, edge and face selections can use Move, Rotate and Scale through the same viewport gizmo.
- The proxy is parented to the source mesh so component transforms operate in mesh-local coordinates.
- Live drag preview replaces renderer BufferGeometry only; MioMeshData remains authoritative.
- Pointer release commits the preview once to document state.
- OrbitControls are disabled while dragging.
- Escape restores the original preview and resets the proxy.
- Translation/scale snapping and fixed 15-degree rotation snapping are supported.
- Gizmo-hit protection prevents edit-mode picking from replacing the active selection while interacting with handles.
- Component preview math is isolated in a deterministic adapter with regression tests.

## Architecture
Component gizmo interaction follows:
selection -> local pivot proxy -> TransformControls -> renderer-only preview -> single MioMeshData commit.

No renderer geometry becomes persisted modeling state.

## Next
- numeric transform entry for selected mesh components;
- local/world transform conversion;
- explicit transaction/history boundary tests;
- region extrusion and topology editing operations.
