# 3D Modeling V2.8 — Rail-Constrained Edge Slide

## Delivered
- Edge Slide for one connected selected edge path or loop.
- Every selected vertex must resolve exactly two non-selected rail neighbors.
- Rail side labels are propagated through incident faces so the same ratio is used coherently across the whole loop.
- Selected edges must be manifold.
- Branching or disconnected selections are rejected.
- Vertices must lie on their inferred rail segments before slide is allowed.
- Ratio is constrained to 0 < ratio < 1.
- Slide changes vertex positions only; topology IDs and face structure remain unchanged.
- Regression tests cover open Loop Cut paths, closed cube cut loops, invalid arbitrary cube edges and ratio bounds.

## Architecture
Edge Slide is a geometry operation over MioMeshData with topology-derived rail constraints. It is designed to consume the new loop-edge selection returned by Loop Cut.

## Next
- Edit Mode Edge Slide control;
- interactive slide drag;
- multi-loop cut spacing;
- bevel/chamfer.
