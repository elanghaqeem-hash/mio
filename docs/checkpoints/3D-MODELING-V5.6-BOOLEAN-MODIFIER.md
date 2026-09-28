# 3D Modeling V5.6 — Boolean Modifier & Scene Operand Binding

## Delivered
- Adds `boolean` to the non-destructive `MioMeshModifier` contract.
- Boolean modifiers reference another scene object by `operandObjectId`.
- Modifier-stack evaluation receives Boolean operands through an explicit scene resolver rather than coupling the geometry kernel to React or Three.js.
- Adds recursive scene-object mesh evaluation so operand modifier stacks are evaluated before Boolean use.
- Adds missing-object, missing-authoritative-mesh, self-reference and cyclic-reference rejection.
- Maps operand mesh coordinates into the target object's local space for finite translation and positive scale.
- Rotation is explicitly rejected in V5.6 because the V5.5 exact Boolean subset remains axis-aligned.
- Studio viewport projection now evaluates scene-bound modifier meshes while `MioMeshData` remains authoritative.
- Regression tests cover translation, scale, immutability, topology safety, missing references, self-reference, cycles and rotation boundary.

## Robustness boundary
Boolean scene binding currently supports translation and positive scale without rotation. This matches the exact axis-aligned Boolean kernel delivered in V5.5. General rotated/arbitrary mesh operands remain a later Boolean-kernel expansion and must reject explicitly today.

## Next fixed roadmap milestone
V5.7 UV Core: per-corner UV data model, deterministic planar/cube unwrap, seam contract and persistence/projection tests.
