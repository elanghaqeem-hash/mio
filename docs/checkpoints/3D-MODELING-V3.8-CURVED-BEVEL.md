# 3D Modeling V3.8 — Welded Curved Bevel Profile

## Delivered
- Welds intermediate segment cross-sections shared by neighboring chamfer quads.
- Closed multi-segment bevels remain watertight instead of creating coincident-but-disconnected seam vertices.
- Adds geometric curvature from 0 (flat chamfer subdivision) to 1 (maximum normal-aware bulge).
- Intermediate rail displacement uses averaged incident chamfer normals at welded cross-sections.
- Existing profile parameter still controls segment distribution across bevel width.
- Curvature is supported by direct bevel commands and immutable interactive preview.
- Edit Mode exposes live Curvature control.
- Guards curvature to 0..1.
- Regression tests verify welded vertex count, zero seam boundaries on a closed loop, manifold/winding integrity, curved displacement and zero-area protection.

## Geometry contract
Boundary rails remain fixed. Only intermediate rails are displaced, preserving attachment to adjacent source faces. Shared intermediate vertices are generated once and reused by neighboring bevel faces.

## Next
- tangent/adjacent-plane constrained circular profile;
- higher-valence pole fan solver;
- bevel miter modes for complex junctions.
