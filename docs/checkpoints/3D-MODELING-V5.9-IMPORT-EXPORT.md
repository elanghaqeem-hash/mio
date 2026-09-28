# 3D Modeling V5.9 — Import/Export Hardening

## Delivered
- Removes placeholder Wavefront OBJ export behavior that previously emitted a standard cube for every object.
- All 3D exchange now requires authoritative `MioMeshData`; missing or empty meshes reject explicitly instead of fabricating geometry.
- Adds deterministic MIO glTF 2.0 exchange profile `MIO-3D-V5.9`.
- Adds glTF JSON export with embedded binary geometry buffer.
- Adds binary GLB 2.0 export with deterministic JSON/BIN chunks.
- Non-destructive modifier stacks are evaluated and baked into exchange geometry without mutating the source scene.
- Standard glTF mesh primitives carry position, optional UV, material-slot grouping, transforms and core PBR material data.
- Exact MIO scene semantics are preserved in glTF `extras.mioScene` for lossless MIO-to-MIO round-trip.
- Adds glTF/GLB MIO-profile import with strict header/profile validation.
- Generic external glTF import is explicitly rejected in V5.9 rather than partially or incorrectly interpreted.
- Separate roughness/metalness maps and emissive values outside core glTF behavior are reported as compatibility warnings while exact MIO values remain preserved in extras.
- Authoritative OBJ export now uses evaluated mesh vertices/faces, object position/rotation/scale, per-corner UVs and material slot names.
- Studio exposes GLB as the primary export while retaining OBJ as a secondary path.
- Regression tests cover byte determinism, modifier baking, immutable source scene, exact MIO glTF/GLB round-trip, OBJ world transforms and explicit unsupported-input rejection.

## Robustness boundary
V5.9 imports the MIO-authored glTF/GLB exchange profile only. It does not claim arbitrary third-party glTF ingestion. Generic glTF parsing, Draco/Meshopt compression, skinning, morph targets and arbitrary external extension support remain outside this milestone and must not be silently accepted.

## Next fixed roadmap milestone
V6.0 Production Integration & Performance: Studio authoring integration, transaction/undo coverage for new V5 features, evaluation caching, stress/performance gates and end-to-end model → save → reopen → export acceptance.
