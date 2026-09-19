# 3D Modeling V1.8 — Face Inset

## Delivered
- Topology-safe single-face inset for polygon faces.
- New inner vertices are derived toward the source-face centroid by a configurable ratio.
- The source face is replaced by an inner face plus a surrounding quad ring.
- Source boundary edges remain connected to neighboring faces.
- Source face winding and material slot are preserved.
- Ratio is constrained to 0 < ratio < 1.
- Edit Mode exposes Inset Face with a configurable ratio.
- Result topology is validated before returning.
- Regression tests cover quad topology, coplanarity, face/vertex counts and ratio bounds.

## Architecture
Inset is a pure MioMeshData operation. Three.js consumes only the validated result.

## Next
- multi-face/region inset;
- bevel core;
- loop cut and edge slide;
- merge/weld, dissolve and split;
- interactive inset drag and numeric transaction history.
