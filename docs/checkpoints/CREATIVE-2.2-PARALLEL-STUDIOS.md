# Creative Engine 2.2 — Separate Editors, Parallel Mio Operation

## Decision
The eight native creative editors remain independent workspaces. Mio coordinates them; Mio does not merge their editor state, UI, history, or native document model into a single editor.

## Studios
- 3D Modelling
- 3D Animation
- 2D / Motion
- Drawing
- Graphic Design
- Photo Editing
- SFX
- Music

## Runtime model
`CreativeParallelOrchestrator` accepts a multi-studio plan and dispatches independent operations to registered studio executors.

Concurrency rules:
1. Different studios may execute concurrently.
2. A single studio has one active Mio operation at a time; additional operations for that studio are queued FIFO.
3. Failure in one studio does not automatically cancel unrelated studios.
4. Every operation has an independent task/asset identity and terminal status.
5. Cancellation is per operation and invokes the studio executor cancellation hook when available.
6. A studio can mount/unmount independently. Queued work remains pending until its executor is registered.

## Example
A single user request may produce:
- Drawing: create storyboard sketches
- 3D: build scene geometry
- Music: create background score
- SFX: prepare sound effects
- Motion: prepare title animation

Mio may run these tracks simultaneously while preserving separate editor documents and histories.

## Safety / governance
Parallel execution does not bypass existing Mio authorization, validation, project lineage, autosave, undo/redo, or export controls. The orchestrator is a scheduling layer only; actual mutations remain owned by each native studio executor and its document kernel.

## Follow-up implementation
- Register adapters for all eight native studios.
- Add Mission Control aggregate progress for a multi-studio job.
- Add dependency edges for operations that genuinely require another studio's output while keeping unrelated work parallel.
- Add bounded concurrency/resource budget for GPU/audio-heavy workloads.
- Add per-studio pause/resume and retry.
