# 3D Modeling V5.8 — Material & Texture Pipeline

## Delivered
- Adds native scene-level PBR material and embedded texture-reference contracts.
- Adds per-object material slot IDs while preserving legacy object color/metalness/roughness as backward-compatible fallback.
- Validates material/texture IDs, PBR numeric ranges, embedded image references, object slot references and per-face material-slot indices.
- Resolves material IDs and texture IDs into deterministic viewport-ready PBR descriptors.
- Extends mesh triangulation/projection with triangle material slots and Three.js geometry groups.
- Projects base-color, normal, roughness, metalness and emissive texture references into `MeshStandardMaterial`.
- Uses UV data delivered in V5.7; base-color/emissive maps use sRGB color space.
- Disposes generated textures/materials when scene projection is rebuilt.
- Material/texture changes now participate in Studio viewport refresh dependencies.
- Regression tests cover material resolution, texture binding, geometry groups, JSON round-trip fidelity, invalid-reference rejection and legacy fallback.

## Robustness boundary
V5.8 embeds texture payloads as `data:image/...;base64` references for deterministic project persistence. External network texture URLs are deliberately rejected in this milestone. Texture painting, asset deduplication/compression and advanced shader graphs are outside V5.8.

## Next fixed roadmap milestone
V5.9 Import/Export Hardening: GLB/glTF round-trip contracts, transforms/material/UV validation, deterministic export metadata and explicit unsupported-feature reporting.
