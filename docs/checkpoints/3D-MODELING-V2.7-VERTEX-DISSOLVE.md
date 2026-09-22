# 3D Modeling V2.7 — Valence-2 Vertex Dissolve

## Delivered
- Safe dissolve for one selected valence-2 vertex.
- The two neighboring rail vertices are reconnected with one restored stable edge.
- Every affected face removes the dissolved vertex while preserving winding/order.
- Boundary and manifold cases are supported.
- Non-manifold incident edges are rejected.
- Dissolve is rejected if a face would collapse below three unique vertices.
- Dissolve is rejected if the restored edge would become non-manifold.
- Edit Mode exposes Dissolve Vertex only for one eligible valence-2 selection.
- After commit, selection moves to the restored edge.
- Activity logging reports the removed vertex and restored edge.
- Regression tests verify that Edge Split -> Dissolve Vertex restores both internal cube and boundary-quad topology.

## Architecture
Valence-2 dissolve is the deterministic inverse of Edge Split for topology where the inserted vertex has no additional branches.

## Next
- general vertex dissolve for manifold fans;
- edge slide;
- multi-loop cuts;
- bevel/chamfer.
