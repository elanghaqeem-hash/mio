# Creative Engine 1.7 — Cross-Studio Integration and Governed Copilot Handoff

## Scope

This checkpoint turns the eight browser-native creative workspaces into a more coherent suite without claiming parity with Blender, After Effects, Photoshop, Lightroom, Krita, Procreate, Reaper, FL Studio, or BandLab.

The emphasis is workflow consistency, accessibility, and human-controlled AI assistance rather than adding another isolated editor surface.

## Delivered

### Shared studio registry

All native creative modes now participate in one explicit studio registry:

- 3D Modelling
- 3D Animation
- 2D / Motion Graphics
- Drawing
- Graphic Design
- Photo Editing
- SFX Studio
- Music Studio

The registry maps Mio system modes to creative document kinds and provides deterministic previous/next studio navigation.

### Cross-studio navigation

The shared `CreativeWorkspaceToolbar` now includes a compact studio switcher. Users can move between creative workspaces without returning to the global navigation first.

Keyboard cycling is available with:

- `Alt + [` — previous creative studio
- `Alt + ]` — next creative studio

The cycle wraps across all eight studios.

### Consistent document shortcuts

Every creative workspace that uses the shared toolbar now receives the same document-level shortcuts:

- `Ctrl/Cmd + S` — save
- `Ctrl/Cmd + Z` — undo
- `Ctrl/Cmd + Shift + Z` — redo
- `Ctrl + Y` — redo

Undo/redo and studio-cycle shortcuts do not override native text editing while focus is inside a text input or textarea. Save remains available globally.

### Accessibility consistency

The shared toolbar now exposes:

- toolbar semantics and explicit `aria-label` values;
- keyboard-focus rings for document actions;
- a live save/status region;
- labelled revision state;
- labelled studio switching;
- responsive hiding of nonessential text on smaller viewports.

### Governed Creative Copilot handoff

Creative workspaces can now open Mio Core with a prefilled, document-aware proposal prompt.

The handoff includes the active studio plus, when launched from the document toolbar:

- document name;
- document kind;
- revision;
- current selection count.

The generated draft explicitly requires Mio to propose changes before execution. It instructs the agent not to mutate the document, run creative pipelines, export, or perform destructive actions until the user approves the proposal. Any eventual edit must continue through Mio's command/document kernel and permission boundary so undo/history remain authoritative.

This handoff uses the existing `CHAT_DRAFT` event path. It does not grant the model direct access to editor state mutation APIs.

## Safety and architecture boundaries

- AI assistance remains proposal-first.
- The shared toolbar does not bypass `CreativeDocumentKernel`.
- Studio switching does not migrate or silently convert documents.
- Save/undo/redo continue to use the existing workspace runtime.
- No provider secret or network entitlement is added.
- No claim is made that the studio suite has application parity with the reference tools.

## Validation

New deterministic tests cover:

- all eight native studio registrations;
- document-kind and system-mode mapping;
- wrapped studio cycling;
- Windows/macOS save, undo and redo shortcuts;
- text-editing shortcut isolation;
- proposal-first Copilot draft boundaries and document context.

The new suite is registered in `runAllTests.ts` and must pass the same repository validation gates as earlier Creative Engine checkpoints.

## Deferred

The following remain separate future checkpoints:

- richer cross-document asset linking and drag/drop between studios;
- shared asset browser and reusable material/preset library;
- non-destructive conversion pipelines between Drawing, Graphic, Photo and Motion 2D;
- agent-generated command proposals that can be previewed as diffs before explicit approval;
- broader keyboard customization and command palette;
- screen-reader audit of each individual canvas/timeline inspector;
- expansion of the legacy `CreativeOrchestrator` generator to parity with all eight editor formats.
