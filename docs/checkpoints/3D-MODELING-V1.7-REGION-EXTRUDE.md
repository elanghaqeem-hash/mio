# 3D Modeling V1.7 — Region Extrude

## Delivered
- Multi-face region extrusion for connected or adjacent face selections.
- Selected region vertices are duplicated once per source vertex.
- Selected faces become translated cap faces.
- Only boundary edges generate side walls.
- Shared/internal edges inside the selected region do not generate internal walls.
- Region direction is derived from the normalized sum of selected face normals.
- Resulting topology is validated before returning.
- Edit Mode exposes a dedicated "Extrude Region +0.25" action for multi-face selections.
- Regression tests cover single-face region behavior, adjacent-face topology, internal-edge suppression, and missing face IDs.

## Architecture
Region extrusion is a pure MioMeshData operation. The viewport consumes its result after the topology operation succeeds.

## Next
- configurable extrusion distance and interactive extrusion drag;
- inset region;
- bevel;
- loop cut;
- merge/weld, dissolve and split;
- stronger manifold/winding diagnostics.
