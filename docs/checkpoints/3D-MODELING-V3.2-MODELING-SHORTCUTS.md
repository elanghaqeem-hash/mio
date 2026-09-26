# 3D Modeling V3.2 — Modeling Shortcuts

## Delivered
- Deterministic shortcut resolver separated from the React viewport so key semantics are unit-testable.
- Tab toggles Object/Edit Mode when no browser/application modifier is held.
- In Edit Mode: 1 = Vertex, 2 = Edge, 3 = Face.
- Q/W/E/R remain Select/Move/Rotate/Scale and now honor modifier isolation.
- Ctrl/Cmd/Alt-modified modeling keys are ignored by the modeling resolver so browser/application shortcuts are not hijacked.
- Ctrl/Cmd+D duplicate behavior remains handled explicitly.
- Delete object behavior remains handled explicitly.
- Shortcut handling is disabled while focus is in input, textarea, select, or contenteditable elements.
- Component-mode buttons expose their numeric shortcuts directly in the Edit Tool Palette.
- Object/Edit controls expose Tab through hover titles.
- Legacy cube conversion still occurs automatically when Tab enters Edit Mode.
- Regression tests cover Q/W/E/R, Tab, 1/2/3, modifier isolation, and unmapped keys.

## Behavioral fix
The previous direct key handler could process modified keys such as Ctrl/Cmd+W as the Move shortcut before the browser/application consumed them. V3.2 resolves unmodified modeling actions first through an explicit contract, preventing that shortcut leakage.

## Next
- configurable shortcut preferences;
- shortcut help overlay/command palette;
- interactive bevel and slide drag;
- multi-segment bevel profile.
