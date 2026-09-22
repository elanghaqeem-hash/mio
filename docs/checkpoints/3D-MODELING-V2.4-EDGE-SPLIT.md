# 3D Modeling V2.4 — Edge Split Foundation

## Delivered
- Split one selected boundary or manifold edge by a configurable ratio.
- A single new stable Mio vertex is inserted and shared by all incident faces.
- Incident polygon winding is preserved by inserting the new vertex directly between the source edge endpoints.
- Boundary edges and two-face manifold edges are supported.
- Non-manifold edges are rejected.
- Split ratio is constrained to 0 < ratio < 1.
- Edit Mode exposes Split Edge plus numeric ratio input.
- After commit, selection moves to the newly created vertex.
- Activity logging records source edge, ratio and created stable vertex ID.
- Result topology is validated before commit.
- Regression tests cover midpoint split, arbitrary ratio, winding order, bounds and non-manifold rejection.

## Architecture
Edge Split is a pure MioMeshData operation and is the lower-level primitive required by upcoming Loop Cut, Edge Slide and Bevel workflows.

## Next
- edge-ring discovery;
- loop cut propagation across quad strips;
- edge slide;
- bevel using paired edge splits and chamfer face generation.
