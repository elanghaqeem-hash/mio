# Creative Engine 1.2 — 3D and Animation Workspace

## Scope

This checkpoint delivers the first domain vertical slice on top of the shared Creative Document Kernel. The interaction model borrows familiar object-mode, outliner, inspector, viewport, and dope-sheet concepts from Blender, Prisma3D, and Source Filmmaker without claiming feature parity or copying their visual identity.

## Delivered

### 3D modelling workspace

- Local WebGL viewport with damped orbit navigation and perspective, front, and top camera presets.
- Object-mode tool state with Q/W/E/R shortcuts for select, move, rotate, and scale intent.
- Scene outliner with selection, visibility, duplicate, delete, and primitive creation.
- Numeric position, rotation, and scale editing plus material color, metalness, roughness, and wireframe controls.
- Existing OBJ export remains available.
- All document edits flow through the shared command/history/autosave path.

### Animation workspace

- Dope sheet with per-property tracks, playhead scrubbing, loop playback, and FPS-aware frame snapping.
- Keyframe creation at the actual transient playhead, avoiding playback-frame writes to document history.
- Keyframe selection and inspector editing for time, value, and interpolation.
- Keyframe deletion and visual selected state.
- All structural edits flow through the same command/history/autosave path as the 3D scene.

## Capability matrix

| Area | Ready in 1.2 | Deferred |
|---|---|---|
| 3D navigation | Orbit, damping, camera presets | Pan/zoom preferences, orthographic camera |
| 3D object editing | Add, select, numeric transform, duplicate, visibility, delete | Direct viewport gizmos, multi-select, snapping |
| 3D materials | Base color, metalness, roughness, wireframe | Texture nodes, UV tools, shader graph |
| 3D geometry | Primitive objects, OBJ export | Vertex/edge/face edit mode, sculpt, modifiers, topology tools |
| Animation timeline | Playback, scrub, loop, dope sheet, FPS snap | Shot sequencer, markers, audio waveform |
| Animation keys | Add, select, edit, delete, interpolation choice | Graph editor, tangent handles, keyframe box selection |
| Character animation | Property tracks | Armatures, skinning, IK/FK, constraints, mocap |
| Rendering | Local structural/WebGL preview | Production renderer, render queue, compositing |
| Cloud/AI generation | Not claimed | Requires a separately governed provider integration |

## Compatibility and safety

- Existing `.mio3d` and `.mioanim` data remains stored in the compatible legacy projection and normalized document nodes.
- Transform, visibility, duplicate objects, keyframes, and interpolation survive undo/redo and repository reopen.
- Playback time remains transient, so continuous preview does not flood the operation log or autosave queue.
- No provider token or secret is stored in creative documents.
- Agent-originated edits remain outside this checkpoint and must pass the existing policy, permission, sandbox, validation, and audit path.

## Validation gate

- Lint and TypeScript checks pass.
- Web and Electron builds pass.
- Full test suite passes, including 3D and animation persistence/history regression coverage.
- GitHub validation and Cloudflare build checks pass before merge.

## Next checkpoint

Deliver Drawing + Graphic Design as a shared layered-canvas vertical slice, then add Photo Editing and 2D/Motion on the same document and workspace contracts.
