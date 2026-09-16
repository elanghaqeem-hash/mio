# Creative Engine 1.5 — 2D/Motion Graphics Workspace

## Scope

This checkpoint adds a native `.miomotion` studio using familiar layer, composition, property-keyframe, and dope-sheet concepts from Adobe After Effects and Adobe Animate. It reuses Mio's shared timeline and document kernel rather than introducing a second animation architecture.

## Delivered

- First-class 2D/Motion workspace in Creative navigation, distinct from sensory Motion Tracking.
- 960×540 local composition preview with shape and text layers.
- Layer selection, visibility, lock, names, text content, and property inspector.
- Animatable x, y, scale, rotation, and opacity properties.
- FPS-aware playhead snapping, playback, looping, property tracks, and clickable keyframes.
- Linear, step, ease-in, ease-out, and ease-in-out evaluation support in the deterministic motion evaluator.
- Current-frame PNG export through the existing permission boundary.
- `.miomotion` migration now projects legacy tracks into the shared `CreativeTimelineModel`.

## Capability matrix

| Area | Ready in 1.5 | Deferred |
|---|---|---|
| Composition | Canvas, background, shape/text layers | Nested compositions, guides, safe areas |
| Properties | Position, scale, rotation, opacity | Anchor point, skew, 3D layers, parenting |
| Timeline | Playback, loop, scrub, FPS snap, property tracks | Work area, markers, layer trimming, time remap |
| Keyframes | Add/replace at playhead, deterministic interpolation | Selection editing, graph editor, tangent handles |
| Preview | Local real-time canvas frame | Cached RAM preview, motion blur, effects pipeline |
| Export | Current-frame PNG | Video/GIF/Lottie render queue, audio muxing |
| Advanced | Not claimed | Expressions, masks, mattes, particles, plugins |

## Compatibility and safety

- Sensory `MOTION` remains unchanged; the creative studio uses the separate `MOTION_2D` system mode.
- Playback time remains transient and does not flood command history or autosave.
- Layer and track mutations flow through the shared command bus and survive undo, redo, autosave, recovery, and reopen.
- No cloud provider or secret is introduced.

## Validation gate

- Deterministic interpolation and FPS snapping tests pass.
- Migration, normalized layers, timeline projection, undo, and redo tests pass.
- Lint, TypeScript, web/Electron builds, release checks, and full tests pass.
- GitHub Validation and Cloudflare Web Build pass before merge.

## Next checkpoint

Expand SFX with waveform/envelope sequencing, then Music with mixer, piano roll, transport, and project export improvements.
