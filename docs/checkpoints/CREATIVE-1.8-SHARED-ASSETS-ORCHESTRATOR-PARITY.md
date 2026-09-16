# Creative Engine 1.8 — Shared Assets and Eight-Studio Orchestrator Parity

## Goal

Move Mio Creative Engine from a set of integrated editors toward a project-level production environment. This checkpoint adds a shared creative asset layer and closes the remaining orchestration/validation gap for Drawing, Photo, and Motion 2D.

## Delivered

### Shared Project Creative Asset Library

Every native creative studio now exposes the same `ASSETS` control through `CreativeWorkspaceToolbar`.

The shared library can:

- display creative assets from all eight native formats;
- filter to assets compatible with the current document type;
- create a project snapshot from the current editor state;
- inspect snapshot type, version, origin, notes, and project path;
- navigate to the studio associated with a different asset format;
- load a same-format project snapshot into the current editor.

### Snapshot semantics

A creative snapshot is stored as a normal project asset with:

- the active document kind as its project asset type;
- `USER-EDITED` origin;
- revision and timestamp in the asset name;
- cloned editor state;
- project-local `CREATIVE/<kind>/...` path;
- explicit snapshot notes.

The snapshot helper never stores a live mutable reference to editor state.

### Safe load boundary

Loading a snapshot is intentionally two-step:

1. choose `LOAD INTO CURRENT`;
2. confirm replacement.

The confirmed state is applied through the existing workspace `setState` command path. Therefore the load becomes part of the Creative Document Kernel history and remains undoable rather than bypassing the editor runtime.

Cross-format assets are not silently converted. The library routes the user to the matching studio instead.

### Project asset type parity

`AssetType` now includes all eight native creative formats:

- `3d`
- `animation`
- `motion-2d`
- `drawing`
- `graphic`
- `photo`
- `sfx`
- `music`

Existing `document` and `reference` project asset types remain unchanged.

### Eight-studio CreativeOrchestrator parity

The legacy creative pipeline planner and generator now recognize:

- Drawing / sketch / illustration requests;
- Photo / retouch / Lightroom / Photoshop-style requests;
- 2D motion graphics / kinetic typography / lower-third / After Effects-style requests.

Motion graphics are no longer automatically misclassified as 3D animation.

New deterministic generated vertical slices include:

- layered `.miodraw` concept illustration;
- nondestructive `.miophoto` document with embedded synthetic source and adjustment recipe;
- `.miomotion` composition with text layer, position animation, opacity animation, timing, and lineage to visual dependencies.

The orchestrator remains a deterministic local prototype generator. This checkpoint does not claim generative-model artistic parity with the reference applications.

### Structural validation parity

`ResultValidator` now validates:

- Drawing dimensions, layers, strokes, opacity, point finiteness, pressure bounds;
- Photo dimensions, layers, opacity, adjustment finiteness, and raster-source presence warnings;
- Motion 2D dimensions, duration, FPS, layer/track existence, target integrity, keyframe bounds, and finite values.

### Project Overview

The Project workspace now:

- recognizes Drawing, Photo, and Motion 2D project assets;
- exposes an explicit eight-studio demonstration pipeline;
- uses responsive 2/4/8-column pipeline layouts instead of the previous five-column assumption.

## Safety and architecture boundaries

- Same-format asset loads require explicit confirmation.
- Snapshot load uses the command/history path and remains undoable.
- Cross-format conversion is not performed implicitly.
- Project snapshots are local project assets; no new network entitlement is introduced.
- The Creative Copilot remains proposal-first as established in 1.7.
- STOP MIO and existing pipeline fail-closed dependency behavior remain authoritative.

## Validation coverage

Creative Engine 1.8 adds deterministic tests for:

- all eight creative project asset mappings;
- immutable snapshot cloning and deterministic metadata;
- creative asset filtering, sorting, and compatibility;
- Drawing, Photo, and Motion 2D structural validation;
- persistence of the three new project asset types;
- planner separation between Motion 2D and 3D Animation;
- end-to-end execution of Drawing + Photo + Graphic + Motion 2D pipeline;
- upstream asset lineage for Motion 2D output.

The suite is registered in the repository-wide validation runner together with the latest MIO Local model promotion tests from the current `main` baseline.

## Deferred to later checkpoints

- real cross-format conversion operations (Drawing → Graphic, Photo → Graphic, Graphic → Motion);
- reusable brush/material/effect/preset packages beyond full-document snapshots;
- thumbnail generation and visual asset previews;
- drag/drop asset placement into canvases and timelines;
- structured AI edit proposals with command-level diff preview and per-operation approval;
- shared render/composition graph for 3D + Motion + Audio final output;
- richer asset search, tags, collections, favorites, and deduplication.
