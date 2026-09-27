# 3D Modeling V4.1 — Generalized Multi-Pole Junction Bevel

## Delivered
- Generalized single-junction miter solver for selected degree 4 or higher.
- Requires a complete star selection: every source edge at the pole must be selected and terminate directly at an endpoint.
- Requires a simple closed manifold face fan with one incident face per pole edge.
- Creates one cut vertex per pole edge using the shared bevel width ratio.
- Rewires the full incident fan and derives the cap n-gon from the actual post-rewire boundary cycle.
- Rejects incomplete selections, material boundaries, non-simple fans, open/non-manifold results, inconsistent winding, and zero-area geometry.
- Source MioMeshData remains authoritative and is not mutated on rejected operations.
- Edit Mode Topology palette adds Multi Miter.
- Regression coverage includes valence-4 watertight geometry and rejection cases.

## Safety boundary
V4.1 supports one complete star junction. Branched networks containing multiple junctions, partial high-valence poles, and mixed path+junction bevels remain explicitly unsupported.

## Next
V4.2 unified bevel network planner: decompose a connected selection into path spans and supported junction nodes before geometry execution.
