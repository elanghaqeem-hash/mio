# MIO 3D Modeling Engine — Development Timeline

Baseline date: 2026-09-28  
Authoritative repository: `elanghaqeem-hash/mio`  
Authoritative branch: `main`

## Current baseline
| Version | Milestone | Status | Evidence |
|---|---|---|---|
| V4.9 | Unified Network Bevel Completion | Merged | PR #489 |
| V5.0 | Modifier Stack Foundation / Mirror | Merged | PR #490 |
| V5.1 | Native Catmull-Clark Subdivision | Merged | PR #491 |
| V5.2 | Solidify Modifier | Merged | PR #492 |
| V5.3 | Array Modifier | Merged | PR #493 |
| V5.4 | Non-Destructive Bevel Modifier | Merged | PR #494 / main `95098b0f` |
| V5.5 | Native Boolean Engine Foundation | Merged | PR #495 / main `87a1c27b` |
| V5.6 | Boolean Modifier + Scene Operand Binding | Merged | PR #496 / main `5bbb9073` |
| V5.7 | UV Core | Merged | PR #497 / main `5e8aca9f` |
| V5.8 | Material & Texture Pipeline | Merged | PR #498 / main `653fb754` |
| V5.9 | Import/Export Hardening | Merged | PR #499 / main `52937fa4` |

## Fixed next-stage roadmap
| Version | Scope | Acceptance gate | Status |
|---|---|---|---|
| V5.5 | Boolean Engine | union/difference/intersection contract; deterministic output; immutable inputs; explicit robustness boundaries; topology-safe regression suite | Merged |
| V5.6 | Boolean Modifier + Scene Operand Binding | non-destructive operand reference; missing/self/cycle protection; modifier evaluation through scene resolver; no Three.js source-of-truth mutation | Merged |
| V5.7 | UV Core | per-corner UV representation; planar/cube unwrap; seam contract; deterministic UV persistence; projection tests | Merged |
| V5.8 | Material & Texture Pipeline | material slots; texture references; PBR parameters; UV-backed viewport projection; save/load fidelity | Merged |
| V5.9 | Import/Export Hardening | GLB/glTF round-trip; mesh/material/transform validation; unsupported-feature reporting; deterministic export | Merged |
| V6.0 | Production Integration & Performance | Studio UI wiring; undo/redo transactions; worker-safe heavy evaluation; caching; stress/performance gates; end-to-end model→save→export validation | In development |

## Tracking rules
1. One milestone = one branch = one PR = one checkpoint document.
2. No milestone is marked **Merged** until its PR is actually merged into `main`.
3. Every geometry-changing milestone must preserve `MioMeshData` as source of truth and treat Three.js only as projection/input.
4. Every milestone must include regression tests for immutability, deterministic IDs/output, invalid-input rejection, and topology safety where geometry is generated.
5. The next milestone starts only from the verified `main` commit after the prior milestone.
6. Any scope reduction or robustness boundary must be documented explicitly; unsupported geometry must reject rather than silently corrupt topology.

## Change log
### 2026-09-28
- Verified `main` at V5.4 Non-Destructive Bevel Modifier.
- Created V5.5 branch.
- Implemented Native Boolean Engine Foundation with exact axis-aligned box CSG subset and safety validation.
- PR #495 passed all three GitHub gates and was squash-merged to `main` as `87a1c27b`.
- V5.6 passed all three GitHub gates and was squash-merged to `main` as `5bbb9073`.
- V5.7 passed all three GitHub gates and was squash-merged to `main` as `5e8aca9f`.
- V5.8 passed all three GitHub gates and was squash-merged to `main` as `653fb754`.
- V5.9 passed all three GitHub gates and was squash-merged to `main` as `52937fa4`.
- Started V6.0 Production Integration & Performance on `creative/3d-modeling-v6.0-production-readiness`.
