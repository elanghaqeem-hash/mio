# 3D Modeling V3.7 — Direct Bevel Drag

## Delivered
- Active bevel preview captures horizontal pointer drag to adjust width directly in the viewport.
- Drag width is derived from the immutable drag-start width and pointer X, preventing cumulative drift.
- Width is clamped to the existing safe 0.01..0.49 range.
- Mouse wheel changes bevel segment count during preview, clamped to 1..16.
- Pointer capture keeps the gesture stable when the pointer leaves the viewport.
- Pointer up/cancel ends the drag without committing; Apply remains the only persistent commit.
- Preview mode uses an east-west resize cursor and contextual viewport hint.
- Regression tests cover deterministic drag mapping, clamps, non-accumulation and wheel segment bounds.

## Interaction
Preview -> drag horizontally for width -> wheel for segments -> tune profile control -> Apply.
Esc/Cancel restores the original mesh snapshot.

## Next
Plane/normal-aware curved geometric profile and higher-valence endpoint fan termination.
