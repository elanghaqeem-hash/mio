# T-7 Creative & 3D Intelligence

Status date: 2026-09-29
Status: COMPLETE

## Goal
Extend Mio file intelligence to creative assets and 3D files using bounded metadata/structure inspection, provenance-aware previews, and evidence-grounded relationships.

## Timeline
- T-7.01#A — COMPLETE: creative/3D asset identity contracts for PSD/SVG/AI/GLTF/GLB/OBJ/FBX/STL/BLEND.
- T-7.01#B — COMPLETE (bounded): signature/structure recognition for PSD, GLB, FBX, BLEND, GLTF, SVG, and OBJ; unsupported/proprietary structures remain unclaimed.
- T-7.02#A — COMPLETE (contract): layered graphic dimensions/layers/visibility/opacity/blend/bounds require parser provenance.
- T-7.03#A — COMPLETE (contract): mesh/vertex/triangle/material/texture/animation metadata require parser provenance and bounded validation.
- T-7.04#A — COMPLETE (contract): preview/render evidence is pixel-bounded and requires explicit local/external/embedded/imported provenance.
- T-7.05#A — COMPLETE (bridge): validated preview evidence can enter T-3 Image Intelligence without claiming an implicit renderer.
- T-7.06#A — COMPLETE (contract): texture/material/external/embedded/derived relationships require evidence, reject traversal-like targets and duplicates, and imported references cannot be silently promoted to verified.
- T-7.07#A — COMPLETE: final implementation head passed Mio CI, MIO Validation Gate, MIO Training Runner Contract, and Cloudflare Web Build.

## Boundary
No proprietary creative parser, 3D renderer, mesh decoder, or vision model is claimed operational unless a concrete adapter exists and passes repository acceptance tests.

## Acceptance evidence
Final implementation head `7a1b019afd54ca89c98bd82462a71fdabdce48a9` passed all four repository workflows. Acceptance covers bounded contracts, validators, signature/structure evidence, preview bridging, and relationship safety; it does not claim proprietary creative parsers, a full 3D renderer, mesh decoder, or vision model execution.
