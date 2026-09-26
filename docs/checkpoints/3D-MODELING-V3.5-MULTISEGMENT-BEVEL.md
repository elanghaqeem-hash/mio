# 3D Modeling V3.5 — Multi-Segment Bevel Profile

## Delivered
- Deterministic bevel-strip subdivision from 1 to 16 segments.
- Shared refinement works on closed-loop, boundary-open and interior-open bevel outputs.
- Symmetric profile distribution parameter in the 0..1 range; 0.5 is linear/neutral.
- Existing two boundary rails remain fixed; intermediate rails are generated from the authoritative MioMeshData chamfer strip.
- Each original chamfer quad is replaced by N consistently wound quads.
- Material slot is preserved across generated segment faces.
- Topology validation, non-manifold detection and winding diagnostics run after refinement.
- Edit Mode exposes width, segment count and profile controls.
- Regression tests cover 4-segment topology, profile symmetry, one-segment identity and bounds.

## Safety
V3.5 profile controls segment distribution across the current chamfer surface. It does not yet displace intermediate rails out of that surface; curved geometric profile displacement belongs to the interactive/profile-normal stage.

## Next
- interactive bevel preview from immutable source snapshot;
- drag-to-width with cancel/commit;
- wheel/keyboard segment adjustment during preview;
- geometric rounded profile using adjacent face planes/normals.
