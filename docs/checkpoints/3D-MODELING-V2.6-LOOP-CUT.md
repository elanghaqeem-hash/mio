# 3D Modeling V2.6 — Quad Loop Cut

## Delivered
- Ratio-based Loop Cut across a discovered quad edge ring.
- Works on open quad strips and closed quad rings.
- One new stable vertex is created per ring edge.
- Ratio orientation is propagated face-to-face so non-midpoint cuts remain aligned across the strip.
- Each traversed quad is split into two valid polygon faces.
- Source face ID remains stable for one side; one deterministic new face ID is created for the other.
- Newly created cut edges are returned explicitly.
- Edit Mode exposes Loop Cut with numeric ratio input.
- After commit, selection moves to the newly created cut loop edges.
- Activity logging reports ratio, cut face count and created vertex count.
- Non-quad and invalid ring traversal are rejected rather than approximated.
- Result topology is validated before commit.
- Regression tests cover open strips, closed cube rings, ratio consistency, connecting cut edges and non-quad rejection.

## Architecture
Loop Cut composes deterministic ring discovery with MioMeshData topology editing. It does not infer the cut from rendered triangles and does not repeatedly mutate BufferGeometry.

## Next
- Edge Slide over the newly created loop;
- multi-loop cuts;
- bevel/chamfer;
- edge-ring preview and interactive drag placement.
