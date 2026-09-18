# 3D Modeling V1.0 — Native Mesh Topology Core

## Goal

Establish the first persistent, renderer-independent mesh editing foundation for Mio 3D Modeling without coupling topology semantics to Three.js scene objects.

## Delivered

- `.mio3d` objects may persist editable indexed mesh data.
- Stable vertex and face identifiers.
- Deterministic derived edge identifiers and face adjacency.
- Topology validation for duplicate IDs, missing references, repeated face vertices, non-finite positions, and non-manifold edge warnings.
- Deterministic cube topology primitive.
- Vertex / edge / face selection normalization.
- Selection-to-vertex resolution for topology edits.
- Translation of selected mesh components.
- Bounded single-face extrusion with deterministic cap, side faces, and generated vertex IDs.
- Regression tests registered in the repository-wide validation runner.

## Deliberate boundaries

This checkpoint does not yet replace Three.js primitive geometry in `Studio3DView`, expose Edit Mode UI, implement multi-face region extrusion, half-edge topology, bevel, inset, loop cut, boolean modifiers, UV editing, sculpting, or production rendering.

## Architecture rule

The persisted `MioMeshData` is authoritative modeling data. Renderer geometry must be treated as a projection derived from this document state. Future viewport work must not mutate Three.js `BufferGeometry` as the source of truth.

## Next checkpoint

3D Modeling V1.1 should wire `MioMeshData` into the native viewport:

1. project editable mesh data into Three.js `BufferGeometry`;
2. add Object/Edit mode switching;
3. render vertex/edge/face selection overlays;
4. add raycast selection;
5. route edit operations through shared Creative Document history/undo-redo;
6. add direct transform interaction for selected mesh elements.
