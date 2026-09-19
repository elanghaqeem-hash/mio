# 3D Modeling V1.9 — Coplanar Region Inset

## Delivered
- Multi-face inset for one edge-connected region.
- Shared vertices are duplicated once and reused by all inset cap faces.
- Boundary-only ring faces are generated; internal shared edges do not create duplicate walls.
- Inset direction is deterministic: selected vertices move toward the region centroid by a configurable ratio.
- Region selection must be coplanar and consistently wound.
- Disconnected selections are rejected.
- Source face material slots are preserved on inset caps and boundary ring faces.
- Result topology is validated before it is returned.
- Edit Mode exposes Inset Region for multi-face selections using the same inset ratio control as single-face inset.

## Safety boundary
V1.9 intentionally rejects non-coplanar regions. A generalized surface-aware region inset requires per-boundary offset solving and is deferred rather than approximated silently.

## Next
- surface-aware region inset;
- bevel core;
- loop cut and edge slide;
- merge/weld, dissolve and split;
- interactive inset drag and transaction history.
