# 3D Modeling V5.7 — UV Core

## Delivered
- Adds optional per-corner UV coordinates to `MioMeshFace`.
- Extends mesh validation so UV corner count must match face vertex count and all UV components must be finite.
- Adds deterministic planar unwrap on X/Y/Z projection axes.
- Adds deterministic cube unwrap using each face's dominant geometric normal.
- Adds UV seam derivation for shared topology edges whose face-corner UVs disagree.
- Keeps unwrap operations immutable: source `MioMeshData` is never mutated.
- Projects complete per-corner UV data into the Three.js `BufferGeometry.uv` attribute.
- UV data persists naturally inside `MioMeshData`; Three.js remains a projection layer only.
- Regression tests cover determinism, normalized coordinates, seam contract, malformed UV rejection and viewport projection.

## Robustness boundary
V5.7 establishes the native UV data/persistence/projection contract and deterministic basic unwraps. Interactive seam marking, island packing, relaxation, pinning and advanced unwrap algorithms are not claimed in this milestone.

## Next fixed roadmap milestone
V5.8 Material & Texture Pipeline: native material-slot definitions, texture references, PBR parameters, UV-backed viewport material projection and save/load fidelity.
