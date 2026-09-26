# 3D Modeling V3.1 — Boundary Open-Loop Bevel

## Delivered
- Bevel for one connected open manifold edge path whose two endpoints terminate on the mesh boundary.
- Reuses the same topology-derived rail resolver as Edge Slide and Closed-Loop Bevel.
- Every selected path vertex is replaced by two stable side vertices along its rail segment.
- Adjacent side faces are rewired to the correct rail side.
- One chamfer quad is created per selected path edge.
- Each open endpoint produces one explicit boundary cap edge between its two bevel-side vertices.
- Endpoint cap edges are verified to remain boundary edges after commit.
- Interior endpoint fans on closed surfaces are rejected rather than guessed.
- Closed selections are rejected and routed conceptually to Closed-Loop Bevel.
- Material boundaries across selected bevel edges are protected.
- Width is normalized to rail distance and rejected if it exceeds local available space.
- Result topology is checked for validity, non-manifold edges and inconsistent winding.
- Edit Mode exposes Bevel Open next to Bevel Loop, sharing the same width-ratio control.
- Generated chamfer faces become the active face selection.
- Regression tests cover boundary-to-boundary bevel, endpoint caps, closed-loop rejection, interior-endpoint rejection, width guards and material-boundary rejection.

## Safety boundary
V3.1 intentionally supports only boundary-terminated open paths. General open bevel ending inside a closed manifold surface requires endpoint fan splitting/capping and remains deferred.

## Next
- general open bevel endpoint-fan solver for interior endpoints;
- multi-segment bevel profile;
- interactive bevel drag/preview;
- keyboard shortcuts for Object/Edit and Vertex/Edge/Face modes.
