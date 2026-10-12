# MIO-PRV-00.07 — Motion Graphic Engine V2 Re-port Plan

Date: 2026-10-11 · Source: #265 (`feat/motion-graphic-engine-v2`, draft) and #356 (sync `main` → that branch)
Target: current `main` plus [#521](https://github.com/elanghaqeem-hash/mio/pull/521)

## 1. Why this needs a plan instead of a merge

- **Unrelated history.** #265 was branched from pre-2026-09-26 history, which shares no ancestor with `main`. #356 tries to sync `main` into it across those unrelated histories.
- **Mixed contents.** The PR's 54 files / +2,580 lines are not just Motion V2. Repeated syncs pulled in **stale copies of other subsystems**: `MioStreamingAudioPlayer.ts` (+252/−?), `functions/api/voice/synthesize.ts`, `src/creative/photo/*`, `src/modes/studio3d/*` (mesh topology/operations/projection), animation IK/FABRIK, and the Music and Graphic views. `main` has newer versions of all of these (Voice V1, 3D Modeling V6.0, Photo domain contract, Music 10.63). **Porting those files would regress `main`.**
- **The Motion V2 core does not pass on its own.** On 2026-10-11 the 15 core files plus the 6 Motion suites were copied from #265 into a scratch worktree on top of #521 (not committed). Results:

| # | Failure | Where | Kind |
|---|---|---|---|
| M-1 | `workspaceController.ts` imports `TimelineViewport`, which `timeline.ts` does not export | `src/creative/motion/workspaceController.ts:4` | compile error |
| M-2 | Comparison between non-overlapping literal types (`"Renamed"` vs `"Test"`) | `src/tests/motionFoundationTests.ts:103` | compile error (test bug) |
| M-3 | 4 of 6 suites return `void` instead of `{ passed, total }` (`runMotionFoundationTests`, `runMotionGraphEditorTests`, `runMotionKeyframeCommandTests`, `runMotionTimelineCommandTests`) | tests | harness contract |
| M-4 | **`Motion keyframe command test failed: undo group move`** | `motionKeyframeCommandTests` → `commands.ts` / `timeline.ts` | **runtime defect in undo** |

All four come from files that exist only on #265, so they are #265's own defects, not caused by the port.

## 2. What is worth porting

| Area | Files on #265 | Port? |
|---|---|---|
| Motion V2 document model, validation, migrations, serialization | `src/creative/motion/{model,validation,migrations,serialization}.ts` | **Yes** (phase 1) |
| Evaluator + runtime (frame-accurate playback) | `evaluator.ts`, `runtime.ts` | **Yes** (phase 1) |
| Timeline, commands, gesture transactions, undo | `timeline.ts`, `timelineCommands.ts`, `commands.ts`, `gestureTransaction.ts` | **Yes, after fixing M-4** (phase 2) |
| Graph Editor V2 core, viewport | `graphEditor.ts`, `viewport.ts` | **Yes** (phase 2) |
| Workspace controller | `workspaceController.ts` | **Yes, after fixing M-1** (phase 2) |
| Legacy ↔ V2 bridge | `legacyAdapter.ts` | **Yes** (phase 3; needed before any UI switch) |
| Motion studio UI | `src/modes/motion2d/Motion2DStudioView.tsx` (+107) | **Re-derive** on `main`'s current view (phase 4) |
| Motion-related edits in `GraphicMotionWorkspace.ts`, `types/creative.ts` | partial | Re-derive only the Motion parts (phase 3/4) |
| Voice, Photo, 3D, Animation, Music, Graphic view, synthesize.ts | many | **No**: stale copies; `main` is newer |
| Design doc | `docs/motion-graphic-engine-v2.md` | **Yes** (phase 1, as the subsystem's architecture reference) |

## 3. Phased plan

Each phase is one PR-sized change with its own gate: `tsc -b`, `oxlint` 0 errors, web + Electron build, and `npm test` all green, with every new suite registered (enforced by the 00.02 self-check).

| Phase | Task ID | Scope | Exit criteria |
|---|---|---|---|
| 1 | MIO-PRV-08.M1 | Model, validation, migrations, serialization, evaluator, runtime, design doc; `motionFoundationTests` and `motionM2CoreTests`, fixed to return `{ passed, total }` (M-2, M-3) | Core compiles standalone; suites green; no UI change |
| 2 | MIO-PRV-08.M2 | Timeline, commands, gesture transactions, graph editor, viewport, workspace controller; **root-cause and fix M-4** (grouped keyframe move undo) and M-1; port `motionKeyframeCommandTests`, `motionTimelineCommandTests`, `motionGraphEditorTests` | Undo/redo of single and grouped moves round-trips exactly; suites green |
| 3 | MIO-PRV-08.M3 | Legacy ↔ V2 bridge; `motionV2CompatibilityTests` | Lossless round trip for existing `.miomotion` projects (easing identity, vector scale, position axes, which #265's own commit log flags as past regressions) |
| 4 | MIO-PRV-08.M4 | Re-derive the Motion studio UI on `main`'s `Motion2DStudioView.tsx`: Graph Editor panel, marquee selection, snap-aware markers, transactional inspector edits | Manual browser check on the Pages preview; legacy projects open unchanged |

Phases 1–3 are pure logic with no UI risk. Phase 4 is the only phase that changes user-visible behavior.

## 4. What happens to #265 and #356

- Keep both open as the reference source until phase 3 lands, then close both as superseded with a link to the phase PRs.
- Do not merge #356: syncing `main` into an unrelated-history branch only deepens the divergence.

## 5. Placement in the roadmap

Motion V2 is a Creative track item (MIO-PRV-08), not on the Runtime V1 critical path. It can run in parallel with PRV-01/02, and it becomes mandatory only if Motion is declared in Runtime V1 scope (readiness gate G-08).
