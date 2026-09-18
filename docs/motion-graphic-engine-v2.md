# MIO Motion Graphic Engine V2

Status: implementation baseline
Branch: feat/motion-graphic-engine-v2

## Goal

Build a native, deterministic motion-graphics and compositing subsystem for MIO. The engine must remain independent from AI providers: AI produces validated motion intents and commands; the document/evaluator/renderer remains deterministic and undoable.

## Architecture

Motion Intent / UI
-> Command Validation
-> Motion Command Bus
-> Composition Document
-> Timeline + Animation Evaluator
-> Scene/Compositing Graph
-> Renderer
-> Export

AI is never allowed to mutate render state directly.

## Core document model

A composition owns:
- stable id, name, width, height, pixel aspect
- frame rate and duration represented in integer frames
- work-area start/end
- ordered layer references
- nested/pre-composition references
- background and render settings
- schema version and migration metadata

A layer owns:
- stable id and type: shape, text, image, video, audio, null, precomp, adjustment, camera
- parent id
- in/out frames
- enabled, locked, solo, shy
- transform group
- masks, mattes, blend mode, effects
- property tracks

Every animatable property is represented by a typed property track. A track may hold a static value or ordered keyframes.

## Timeline V2

Required:
- frame-accurate playhead and scrubbing
- multi-layer timeline
- expandable property tracks
- keyframe add/delete/move/copy/paste
- box/range selection
- snapping to frames, keyframes, markers and layer boundaries
- layer in/out trim
- markers and work area
- timeline zoom and horizontal/vertical navigation
- FPS-aware timecode
- keyboard-accessible editing

Invariant: internal animation time uses integer frame/tick coordinates. Floating wall-clock time must not be the source of truth.

## Animation Evaluator V2

Interpolation:
- hold
- linear
- cubic Bezier temporal easing
- spatial Bezier paths for position
- independent dimensions where supported

Keyframe data:
- frame
- value
- interpolation
- incoming/outgoing tangent
- temporal influence/velocity
- spatial tangent when applicable

Evaluation must be pure: evaluate(document, frame) returns the same scene state for the same versioned document.

## Graph Editor

Two modes:
- Value Graph
- Speed Graph

Operations:
- draggable handles
- auto/continuous/broken tangents
- ease in/out/ease
- numeric velocity and influence
- multi-keyframe editing

## Layer, hierarchy and pre-composition

Implement:
- parenting without destructive geometry mutation
- null/controller layers
- stable hierarchy evaluation
- pre-composition as nested composition reference
- collapse/flatten policy deferred to renderer
- cycle detection for parenting and composition references

## Shape/vector motion

Initial operators:
- rectangle, ellipse, polygon/star, Bezier path
- fill/stroke/gradient
- animated path
- trim paths
- repeater
- dash/gap
- path morph where topology is compatible

## Typography motion

Reuse shared typography primitives where possible, then add:
- per-character, word and line selectors
- position/scale/rotation/opacity/tracking animators
- range selector
- text-on-path
- deterministic text layout snapshot for rendering

## Masking and compositing

Implement:
- Bezier mask
- mask path animation
- opacity, feather, expansion
- add/subtract/intersect modes
- alpha and luma matte
- blend modes
- adjustment layers

Compositing order must be explicitly specified and covered by golden-frame tests.

## Effects V1

Start with deterministic effects:
- transform
- Gaussian blur
- glow
- drop shadow
- brightness/contrast
- hue/saturation
- levels/basic curves

Every effect parameter uses the same property-track abstraction and is therefore keyframeable.

## Advanced phase

After the baseline is stable:
- motion blur
- time remapping
- speed ramp
- 2.5D layers
- camera and parallax
- procedural/expression system in a sandbox
- particles/procedural generators

## Media

- raster/vector asset references
- image sequences
- video layers
- audio layers and waveform cache
- frame/sample synchronization
- missing-media relink
- proxy strategy for large assets

## Render/export

Render pipeline:
Document -> Evaluator -> Scene Graph -> Compositor -> Frame Surface -> Encoder

Targets, staged:
1. PNG frame/sequence
2. animated WebP/GIF where appropriate
3. video container through an isolated encoder adapter
4. reusable motion template/preset format

Render jobs must support resolution, FPS, range, alpha/background and quality presets.

## AI Motion Director contract

Natural-language requests are converted to a MotionIntent, then to proposed commands.

Example:
"Animate this title from below for 0.8 seconds with overshoot."

AI may propose:
- selected target layer
- property changes
- keyframe frames/values
- easing preset
- optional secondary animation

The UI must show a preview/diff before applying destructive or broad edits. Accepted operations go through the normal command bus and undo stack.

## Reliability

Mandatory:
- command transactions
- undo/redo
- autosave/recovery
- schema migration
- malformed-document validation
- parent/precomp cycle detection
- deterministic evaluation tests
- golden-frame renderer tests
- serialization round-trip tests
- no AI/network dependency for local playback/rendering

## Performance budgets

Initial engineering targets, subject to profiling:
- interactive timeline manipulation should avoid blocking the UI thread
- cache evaluated static subtrees
- invalidate only affected tracks/layers
- virtualize large timeline layer lists
- worker/off-thread rendering where platform permits
- proxy media for high-resolution video

## Implementation gates

### Gate M1 — Foundation
Composition schema, typed tracks, commands, serialization, migrations and deterministic evaluator.

### Gate M2 — Usable animation slice
Shape/text layers, transform tracks, timeline editing, playback, easing, undo/redo, save/reopen and PNG render.

### Gate M3 — Professional animation
Graph Editor, spatial paths, parenting, nulls and pre-compositions.

### Gate M4 — Compositing
Masks, mattes, blend modes, effects and adjustment layers.

### Gate M5 — Rich motion
Shape operators, typography animators, media/audio and time controls.

### Gate M6 — Advanced/render
Motion blur, 2.5D/camera, render queue and encoded video.

### Gate M7 — AI direction
Intent parser, proposed-command preview, transactional apply and safe rollback.

## Definition of Done for M2

A user can create a 1920x1080 composition, add text and shape layers, animate position/scale/rotation/opacity with keyframes and easing, scrub/play frame-accurately, undo/redo edits, save/reopen with identical animation state, and render deterministic PNG frames.

No M2 item is complete solely because UI controls exist; document state, evaluator, persistence and tests must all pass.
