# 3D Modeling V2.0 — Vertex Weld & Cleanup

## Delivered
- Deterministic weld for two or more selected vertices.
- Lexically stable survivor vertex identity.
- Survivor position uses the arithmetic mean of welded vertices.
- All affected face references are remapped to the survivor.
- Repeated and consecutive face references are compacted.
- Faces collapsing below three unique vertices are removed and reported.
- Weld by Distance with transitive clustering across the selected vertex set.
- Distance clusters are stable and deterministic.
- Edit Mode exposes Weld Vertices and Weld Distance with a configurable threshold.
- Result topology is validated after each weld operation.
- Regression tests cover survivor identity, polygon compaction, collapsed-face removal, transitive distance clustering, no-op distance behavior and invalid IDs.

## Architecture
Weld operations modify MioMeshData directly and return stable topology IDs. Renderer geometry is regenerated only after the validated result is committed.

## Next
- merge-at-first / merge-at-last / merge-at-cursor policies;
- dissolve vertex and dissolve edge;
- bevel;
- loop cut and edge slide;
- topology cleanup and duplicate-face diagnostics.
