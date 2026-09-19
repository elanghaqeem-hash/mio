# 3D Modeling V2.0 — Vertex Weld Foundation

## Delivered
- Deterministic weld for two or more selected vertices.
- Survivor vertex is chosen lexically for stable identity.
- Survivor position is the arithmetic mean of welded vertices.
- All affected face references are remapped to the survivor.
- Consecutive and repeated vertex references are compacted.
- Faces that collapse below three unique vertices are removed and reported.
- Edit Mode exposes Weld Vertices for multi-vertex selections.
- Result topology is validated before commit.
- Regression tests cover deterministic survivor identity, polygon compaction, collapsed-face removal and invalid IDs.

## Architecture
Weld is a pure MioMeshData operation. Selection is reduced to the surviving stable vertex ID after commit.

## Next
- merge-at-first / merge-at-last / merge-at-cursor policies;
- weld-by-distance;
- dissolve vertex/edge;
- bevel;
- loop cut and edge slide;
- topology cleanup diagnostics.
