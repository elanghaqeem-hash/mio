# 3D Modeling V3.3 — Shortcut Help Overlay

## Delivered
- Centralized shortcut help catalog grouped into Workspace, Transform, Components and Object Actions.
- Modeling shortcut resolver adds a dedicated `toggle-help` action for the `?` key.
- The 3D viewport status bar exposes a visible `? Shortcuts` affordance.
- Shortcut help opens as a responsive, scrollable overlay and does not forward pointer events into the viewport.
- Pressing `?` toggles the overlay from Object or Edit Mode.
- Pressing `Esc` closes the overlay before normal modeling shortcut handling continues.
- Shortcut scope is shown explicitly as Global or Edit.
- The catalog includes Tab, Q/W/E/R, 1/2/3, Ctrl/Cmd+D, Delete and Esc behavior.
- Regression tests cover help-toggle resolution, catalog completeness, unique group names and Edit-only component scope.

## UX objective
Modeling shortcuts should remain discoverable as Mio's native topology toolset grows. The overlay keeps keyboard workflows visible without adding another permanent toolbar.

## Next
- configurable shortcut preferences;
- searchable command palette;
- interactive bevel/slide preview;
- multi-segment bevel profiles and modifier-stack work.
