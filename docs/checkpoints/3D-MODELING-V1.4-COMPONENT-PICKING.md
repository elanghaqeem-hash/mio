# 3D Modeling V1.4 — Component Picking

## Delivered
- screen-space vertex picking with configurable pixel threshold;
- screen-space edge picking using point-to-segment distance;
- click and Shift+click vertex multi-selection;
- click and Shift+click edge multi-selection;
- empty-click clear semantics for all component modes;
- face picking continues to use triangle raycasting and stable face mapping;
- regression coverage registered in the repository validation runner.

## Architecture
Picking converts viewport input into stable Mio topology IDs. It never edits renderer geometry directly.

## Next
TransformControls/component gizmo, selected vertex/edge emphasis, drag transaction history, then region extrusion and topology operations.
