# 3D Modeling V5.5 — Native Boolean Engine Foundation

## Delivered
- Adds native Boolean operations: `union`, `difference`, and `intersection`.
- V5.5 uses an explicit robust foundation for closed manifold axis-aligned box operands.
- Operations are evaluated through deterministic coordinate-cell partitioning; no source mesh mutation occurs.
- Result geometry is rebuilt with deterministic IDs and outward face winding.
- Empty intersections are represented as a valid empty `MioMeshData`.
- Final results pass structural validation plus boundary, non-manifold, winding, duplicate-face, zero-area, and isolated-vertex safety gates.
- Unsupported arbitrary/non-axis-aligned mesh operands reject explicitly instead of returning uncertain topology.
- Regression tests cover union, difference, intersection, empty results, determinism, immutability, and unsupported operand rejection.

## Robustness boundary
This milestone intentionally does not claim general arbitrary-mesh CSG. Arbitrary triangulated/concave mesh Boolean requires a later classification/intersection kernel. V5.5 establishes the operation contract, validation gates, deterministic output model, and a safe exact subset.

## Next fixed roadmap milestone
V5.6 Boolean Modifier & Scene Operand Binding: bind a Boolean modifier to another scene object without making Three.js authoritative, add operand lifecycle validation, self-reference protection, missing-object handling, and non-destructive stack evaluation.
