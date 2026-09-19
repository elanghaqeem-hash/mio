# 3D Modeling V1.3 — Selection Overlays

## Delivered
- topology-derived vertex point overlay;
- topology-derived edge line overlay;
- selected face translucent overlay;
- overlay transforms follow the source object's position, rotation and scale;
- overlays are renderer-only helpers and are disposed/rebuilt safely;
- deterministic overlay builders covered by global regression tests.

## Editing model
MioMeshData remains authoritative. Selection overlays contain no persisted geometry and never mutate topology.

## Next
Vertex/edge raycast picking, selected-component emphasis, TransformControls integration, drag transaction history, then region extrusion and professional topology tools.
