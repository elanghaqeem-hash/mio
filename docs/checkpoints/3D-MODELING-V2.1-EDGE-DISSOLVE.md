# 3D Modeling V2.1 — Edge Dissolve

## Delivered
- Dissolve for one internal manifold edge shared by exactly two faces.
- The two incident faces are merged into one polygon while preserving the outer boundary.
- Lexically stable survivor face identity.
- Opposite winding across the dissolved edge is required.
- Material-slot boundaries are protected: dissolve is rejected when the two faces use different slots.
- Boundary and non-manifold edges are rejected.
- Degenerate or self-referencing merged polygons are rejected.
- Edit Mode enables Dissolve Edge only when the current edge selection is eligible.
- After dissolve, the surviving merged face becomes the active face selection.
- Select First now supports Edge Mode as well as Vertex/Face.
- Result topology is validated before commit.
- Regression tests cover successful merge, survivor identity, boundary rejection and material-boundary rejection.

## Architecture
Edge Dissolve is a pure MioMeshData operation. It never infers topology from rendered triangles.

## Next
- vertex dissolve;
- dissolve face/region semantics;
- bevel;
- loop cut and edge slide;
- topology diagnostics and non-manifold repair.
