# 3D Modeling V1.1 — Native Edit Mode

This checkpoint connects persistent Mio mesh topology to the Studio 3D viewport.

## Delivered
- Native MioMeshData to Three.js BufferGeometry projection.
- Deterministic polygon fan triangulation and triangle-to-face mapping for future raycast picking.
- Object/Edit workspace mode switch.
- Editable cube creation and lazy conversion of legacy cube primitives.
- Vertex, edge and face selection mode state.
- Initial edit controls for component translation.
- Single-face extrusion connected to persistent scene state.
- Mesh topology counts visible in Edit Mode.
- Projection regression tests registered in the global validation gate.

## Current interaction boundary
This checkpoint intentionally uses deterministic edit controls rather than pretending full viewport picking exists. Triangle-to-face mapping is now available for the next raycast-selection checkpoint.

## Next
- raycaster face selection in viewport;
- vertex and edge overlay helpers;
- transform gizmo for component selections;
- transactional undo/redo for continuous drags;
- multi-selection and region extrusion;
- inset, bevel and loop-cut topology operations.
