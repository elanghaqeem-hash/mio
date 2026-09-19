# 3D Modeling V2.3 — Face Winding & Normal Direction

## Delivered
- Manual face winding flip for one or more selected faces.
- Graph-based winding recalculation across all connected face components.
- Shared manifold edges are constrained to opposite traversal directions.
- Boundary edges are allowed.
- Non-manifold edges are rejected from automatic recalculation.
- Contradictory orientation constraints are rejected instead of guessed.
- Face IDs and material slots remain stable when winding changes.
- Regression tests cover already-consistent meshes, inconsistent shared edges, manual flip semantics and non-manifold rejection.

## Important semantic boundary
Recalculate Winding makes each connected component internally consistent. It does not guess which side is globally "outside"; outward/inward orientation needs a separate volume-aware operation.

- Edit Mode exposes Flip Faces for selected faces and Recalculate Winding for the whole editable mesh.
- Automatic recalculation is disabled when diagnostics detect non-manifold edges.
- Operations emit activity-log summaries, and rejected recalculations are reported without mutating the mesh.

## Next
- outward orientation for closed volumes;
- normal visualization;
- bevel;
- loop cut and edge slide.
