# 3D Modeling V2.2 — Topology Diagnostics & Safe Cleanup

## Delivered
- Boundary edge detection.
- Non-manifold edge detection.
- Isolated vertex detection.
- Zero-area face detection.
- Duplicate-face grouping with rotation/reversal normalization.
- Material-aware duplicate-face protection.
- Shared-edge winding consistency diagnostics.
- Connected face-component discovery.
- Safe cleanup for exact duplicate faces and isolated vertices.
- Cleanup preserves material-distinct coincident faces.
- Regression tests for closed meshes, open surfaces, winding errors, duplicate faces, isolated vertices, material boundaries and zero-area geometry.

## Safety boundary
Automatic cleanup is intentionally conservative. It removes only exact same-material duplicate faces and vertices that are no longer referenced. Zero-area faces, winding errors and non-manifold topology are diagnosed but not silently rewritten.

## Next
- Edit Mode diagnostics HUD and Safe Cleanup action;
- non-manifold repair strategies;
- normal recalculate/flip;
- bevel;
- loop cut and edge slide.
