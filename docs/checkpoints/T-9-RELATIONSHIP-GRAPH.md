# T-9 Relationship Graph

Status date: 2026-09-29
Status: COMPLETE

## Goal
Build an evidence-grounded asset relationship graph over exact duplicates, semantic similarity, project/client association, temporal proximity, content references, and dependencies.

## Timeline
- T-9.01#A — COMPLETE: evidence-grounded graph node/edge schema and invariants.
- T-9.02#A — COMPLETE: SHA-256-grounded exact duplicate edges with confidence 1.
- T-9.03#A — COMPLETE: thresholded semantic similarity edges preserve model-space evidence and score.
- T-9.04#A — COMPLETE: project/client associations distinguish inferred vs user-confirmed evidence; temporal edges retain distance/window evidence.
- T-9.05#A — COMPLETE: directed structure-grounded content/dependency edges.
- T-9.06#A — COMPLETE: bounded breadth-first traversal with direction/kind filters, max depth 8, max nodes 1000, and truncation reporting.
- T-9.07#A — COMPLETE: final implementation head passed Mio CI, MIO Validation Gate, MIO Training Runner Contract, and Cloudflare Web Build.

## Boundary
Edges are evidence, not facts beyond their declared source. Similarity and inferred associations remain explicitly scored/inferred.

## Acceptance evidence
Final implementation head `b32a5e634771ccd84a5dd2dc7604c8b0d77392f0` passed all four repository workflows. Acceptance covers graph invariants, evidence-grounded edge builders, bounded traversal/filtering, and truncation reporting. Inferred/similarity relationships remain distinct from confirmed identity.
