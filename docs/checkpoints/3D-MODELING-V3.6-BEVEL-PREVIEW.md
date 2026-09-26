# 3D Modeling V3.6 — Interactive Bevel Preview

## Delivered
- Immutable MeshBevelPreviewSession snapshots MioMeshData and selected edge IDs at preview start.
- Every width/segment/profile preview is recomputed from the original snapshot; previews never accumulate topology drift.
- Closed, boundary-open and interior-open paths share one preview session contract.
- Edit Mode Preview projects transient geometry directly to the renderer without writing document state.
- Width, segments and profile controls update the active preview live.
- Apply performs one persistent mesh update and selects generated bevel faces.
- Cancel restores the exact original renderer geometry without document mutation.
- Escape cancels an active bevel preview before other modeling shortcut handling.
- Regression tests cover immutable recomputation, exact cancel restoration and path classification.

## Transaction contract
Pointer/UI parameter changes -> transient renderer projection -> Apply -> one MioMeshData document update.
Cancel/Escape -> restore snapshot -> zero document updates.

## Next
- direct pointer drag for bevel width;
- wheel/keyboard segment changes during active preview;
- adjacent-plane/normal-aware curved bevel profile;
- higher-valence endpoint fan solver.
