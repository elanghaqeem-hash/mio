# MIO-PRV-00.01 — Open PR & Branch Consolidation Audit

Audit date: 2026-10-11
Audited main HEAD: `802af2db60643db4969312fea1226e037abc26eb` (T-17: Performance & Scalability)
Scope: all 70 open pull requests and all 540 remote branches of `elanghaqeem-hash/mio`.

> This document records evidence only. **No PR has been closed, merged, or rebased and no branch has been deleted** as part of this audit. Closing and deleting require owner confirmation (MIO-PRV-00.03 / 00.09).

## 1. Why ancestry cannot be used

`main` has 50 commits; its root commit is dated 2026-09-26. Only 2 of 540 remote branches are ancestors of `main`, and every PR created before 2026-09-26 shares **no common ancestor** with `main` (unrelated histories). A GitHub "merge" of those PRs is therefore not meaningful, and branch "merged" status cannot be trusted.

## 2. Method (content-based, reproducible)

For each open PR, using the PR's recorded `base.sha` and `head.sha`:

1. Extract the PR's own change set: `git diff <merge-base(base, head)> <head>`.
2. Reverse-apply check against `main` → if it reverses cleanly, the change is **already in main**.
3. Real 3-way apply onto a clean `main` worktree → count conflicted files and the **net change** the PR would still make to `main`.
4. Per changed file, compare the PR head blob with the `main` blob (identical / differs / absent from main).
5. For files that differ, check whether the feature's key symbols exist on `main` (feature landed in a later form) or are absent (feature not landed).

A PR whose only residual delta is the `runners` list in `src/tests/runAllTests.ts` (a file every PR touches) is treated as landed.

## 3. Classification summary

| Class | Count | Meaning |
|---|---:|---|
| SUPERSEDED / DUPLICATE | 55 | Content already on `main` (identical or in a later form). Safe to close after owner confirmation. |
| READY FOR INTEGRATION | 5 | Not on `main`, applies cleanly. Needs rebase + full gate before merge. |
| CURRENT (conflicted) | 2 | Authoritative candidate not on `main`; small conflict to resolve. |
| CONFLICTED — needs review | 5 | Not identical to `main`; `main` evolved the same files. Decide port vs. superseded per PR. |
| EXPERIMENTAL | 2 | Large, conflicted architecture work (Motion V2). |
| BLOCKED | 1 | Fails its own test; depends on an unresolved architecture decision. |
| **Total** | **70** | |

## 4. Authoritative implementation per subsystem

| Subsystem | Authoritative source | Superseded / duplicate PRs |
|---|---|---|
| Voice V4.4 → V4.6.4, classifier, adaptive buffer | **`main`** (`src/services/voice/*`, `functions/api/voice/synthesize.ts` engine `v4.7`) | #256, #269, #273, #275, #279, #284, #286, #291, #296, #297, #299, #301, #305, #309, #314, #317, #320, #326, #331, #336, #341, #344, #349, #353, #364, #371, #375, #380, #384, #390, #395, #400, #406, #411, #414, #422, #429, #436, #440 (39) |
| Voice — Cloudflare Workers AI TTS | **#502** (not on `main`) | — |
| Drawing 0.1–0.3 (stroke, atomic commit runtime, renderer) | **`main`** (`src/creative/drawing/*`) | #373, #383, #396 |
| Drawing 0.4 brush engine | **#418** (v2; branch `creative/drawing-0.4-brush-engine` v1 has no PR) | — |
| SFX 10.18 Sample & Waveform Core | **#427** (release v4, latest) | #262, #324, #354, #382, #393, #410 |
| SFX 10.19 Timeline | **#431** (draft, stacked on #427) | — |
| 3D Modeling V1.x–V6.0 | **`main`** (V6.0 closeout merged as #500/#501) | #370, #386, #485 |
| Graphic V2.5.2, V3.1.4, V3.2.1 | **`main`** | #245, #333, #362 |
| Graphic V3.2.4 segment hit/insert | **#428** | — |
| Photo PHOTO-01 domain contract | **`main`** (`src/creative/photo/*`, `runPhotoDomainContractTests` registered) | #303 |
| Motion Graphic Engine V2 | **#265** (experimental) + sync PR #356 | — |
| Music 10.63 offline AUX/FX automation | **#423** | — |
| Animation V2.23 IK handle focus | **#424** | — |
| Agent ↔ File Intelligence (T-18) | **#520** (blocked) | — |

## 5. Per-PR evidence

Columns: PR files changed · conflicted files on 3-way apply · net files `main` would still change · PR-head files byte-identical to `main`.

### 5.1 SUPERSEDED / DUPLICATE (55)

| PR | Branch | Files | Conflicts | Net files | Identical | Evidence |
|---|---|---:|---:|---:|---|---|
| #256 | feat/mio-voice-v4-4-reconciled (draft) | 4 | 1 | 4 | 0/4 | `main` voice runtime evolved through V4.7 / V1 acceptance; superseded |
| #269 #273 #275 #279 | feat/mio-voice-v4-5-* | 3 | 1 | 1 | 1/3 | `synthesize.ts` on `main` reports engine `v4.7`; V4.5 adapter superseded |
| #284 #286 | feat/mio-voice-v4-6-playback / -integrate | 2 | 1 | 1 | 1/2 | playback telemetry (`MioPlaybackMode`, `firstAudibleLatencyMs`) present on `main` |
| #291 | feat/mio-voice-v4-6-1-barge-in | 2 | 0 | 0 | 2/2 | already in `main` (reverse-applies) |
| #296 | feat/mio-voice-v4-6-2-streaming-v2 | 2 | 2 | 2 | 0/2 | adaptive streaming doc + player on `main` in later form |
| #297 #299 #301 #305 #309 #314 #317 #320 #326 #331 #336 #341 #344 #349 #353 | feat/mio-voice-v4-6-3-* (15 landing attempts) | 2 | 1 | 1 | 1/2 | `prebufferTargetChunks` (bounded prebuffer) present on `main` |
| #364 #371 #375 #380 #384 #390 #395 #400 | feat/mio-voice-v4-6-4-* (8 landing attempts) | 2 | 1 | 1 | 1/2 | residual = conflict markers only; correctness logic on `main` |
| #406 #411 #414 | feat/mio-voice-*adaptive* | 4 | 1 | 1 | 3/4 | `MioAdaptiveBufferController.ts` identical on `main`; residual = runner list |
| #422 #429 #436 #440 | feat/mio-voice-playback-*classifier* | 3 | 1 | 1 | 2/3 | `MioPlaybackConditionClassifier.ts` identical on `main`; residual = runner list |
| #373 #383 #396 | creative/drawing-0.2-* | 4 | 1 | 1 | 3/4 | atomic commit runtime identical on `main`; residual = runner list |
| #262 | mio/sfx-sample-waveform-v1 (draft) | 2 | 0 | 2 | 0/2 | early foundation, superseded by SFX 10.18 line (#427) |
| #324 #354 #382 #393 #410 | mio/sfx-10.18-* (rc/final/v1/v2/v3) | 11–13 | 1–2 | 11–13 | 0 | earlier iterations of #427 |
| #370 | creative/3d-modeling-v1.4-component-picking | 9 | 3 | 3 | 6/9 | `main` carries 3D Modeling through V6.0 |
| #386 | creative/3d-modeling-v1.5-transform-engine | 3 | 2 | 3 | 0/3 | `MeshTransformController.ts` on `main` in later form |
| #485 | creative/3d-modeling-v4.6-network-face-rewrite | 5 | 2 | 2 | 2/5 | V4.6 checkpoint + V4.7–V6.0 merged on `main` (r2/verified branch landed) |
| #245 #333 #362 | graphic V2.5.2 / V3.1.4 / V3.2.1 | 1–2 | 0 | 0 | — | net change 0 → already in `main` |
| #303 | photo/domain-contract-v1 | 5 | 4 | 4 | 1/5 | photo domain contract on `main` in later form; tests registered |

### 5.2 READY FOR INTEGRATION (5) — not on `main`, apply cleanly

> Update 2026-10-11: all five are ported in [#521](https://github.com/elanghaqeem-hash/mio/pull/521) (MIO-PRV-00.04). Once #521 merges they become SUPERSEDED and can be closed.

| PR | Branch | Files | +lines | Notes |
|---|---|---:|---:|---|
| #502 | feat/mio-voice-cloudflare-workers-ai | 2 | 67 | Adds `cloudflare-workers-ai` TTS provider (MeloTTS). Lowest-cost hosted TTS option; deliberately falls back to device voice for unsupported locales (incl. `id-ID`). Needs a gateway test before merge. |
| #418 | creative/drawing-0.4-brush-engine-v2 | 6 | 65 | Brush engine foundation + tests. |
| #423 | music-studio/10.63-offline-aux-fx-automation | 1 | 6/−6 | Offline render parity for AUX/FX automation. |
| #424 | feat/animation-v2-23-ik-handle-focus | 3 | 5/−5 | Viewport IK handle focus. |
| #428 | feat/graphic-v324-interactive-segment-hit | 1 | 6/−3 | Wires segment hit/insert into the Graphic canvas (also consumes currently-unused imports flagged by lint). |

### 5.3 CURRENT (conflicted) (2)

> Update 2026-10-11: both ported in [#521](https://github.com/elanghaqeem-hash/mio/pull/521) (MIO-PRV-00.05). Once #521 merges, #427 and #431 and the earlier 10.18 iterations (#324, #354, #382, #393, #410) can be closed.

| PR | Branch | Files | Conflicts | Notes |
|---|---|---:|---:|---|
| #427 | mio/sfx-10.18-release-v4 | 12 | 1 | Authoritative SFX 10.18. `SFXSample*`, `SFXUnifiedGraph` absent from `main`. |
| #431 | mio/sfx-10.19-timeline-v1 (draft) | 4 | 2 | Based on #427's branch; integrate after #427. |

### 5.4 CONFLICTED — needs review (5)

> Decisions 2026-10-11 (MIO-PRV-00.06):
>
> | PR | Decision | Evidence |
> |---|---|---|
> | #182 | **SUPERSEDED** | Library-only (no UI). `main`'s piano roll uses its own `moveNote`, `resizeNote`, `quantizeNoteEvent`, `transposeNotes`. Its `duplicateMusicNote` has no equivalent and was never wired into a UI; recorded as a Music roadmap gap instead of porting dead code. |
> | #198 | **SUPERSEDED** | `beginGraphicResize`, `updateGraphicResize`, `beginGraphicRotation`, `updateGraphicRotation`, `getGraphicSelectionBounds` all on `main`; only the session type name differs. |
> | #214 | **SUPERSEDED** | Same behavior on `main` as `beginGraphicGroupResize`/`updateGraphicGroupResize`, `getGraphicSelectionBounds`, `beginGraphicRotation`. |
> | #287 | **SUPERSEDED** | Bézier handle editing is on `main` (`activeBezierHandle` in `GraphicStudioView`, `setGraphicSmoothPathHandle`). |
> | #368 | **REIMPLEMENTED** in [#521](https://github.com/elanghaqeem-hash/mio/pull/521) | Real gap: live automation was per-step stairs. Not ported verbatim, because it duplicated the post-10.63 parameter mapping and used `setValueCurveAtTime`, which throws on overlapping per-step curves. Reimplemented with overlap-safe ramps and the shared mapper. |

| PR | Branch | Files | Conflicts | Question to resolve |
|---|---|---:|---:|---|
| #182 | feat/music-studio-2-sequencer-core | 3 | 2 | `musicSequencerCoreTests` absent from `main`; check whether Music 10.x on `main` already covers the sequencer core. |
| #198 | creative/graphic-motion-11.3-transform-core | 2 | 2 | `GraphicMotionWorkspace.ts` evolved on `main`; likely superseded. |
| #214 | feat/graphic-v21-transform-complete | 2 | 1 | Group transform primitives; likely superseded. |
| #287 | feat/graphic-v304-bezier-handles | 1 | 1 | Bézier handle editor UI; `main` has handle setters — verify UI parity. |
| #368 | music-studio/10.54-interpolation-scheduler | 1 | 1 | Interpolation-aware live automation; verify against `main`'s scheduler. |

### 5.5 EXPERIMENTAL (2)

> Update 2026-10-11: see the [Motion V2 re-port plan](./MIO-PRV-00.07-MOTION-V2-REPORT-PLAN.md). A trial port showed #265's own Motion core fails 4 checks (2 compile errors, 4 suites returning `void`, and an undo defect in grouped keyframe moves), and that its non-Motion files are stale copies that would regress `main`.

| PR | Branch | Notes |
|---|---|---|
| #265 | feat/motion-graphic-engine-v2 (draft) | 54 files, +2,580 lines, 13 conflicted files, 37 net files. Motion V2 is an active roadmap target; `main` has only `src/creative/MotionWorkspace.ts`. Requires a planned re-port onto current `main`, not a merge. |
| #356 | `main` → feat/motion-graphic-engine-v2 | Sync PR on unrelated histories. Superseded by whatever re-port plan MIO-PRV-00.07 adopts. |

### 5.6 BLOCKED (1)

| PR | Branch | Finding |
|---|---|---|
| #520 | feat/mio-agent-integration-t18 | **Fails its own test.** `agentFileIntegrationTests` case 4 calls `selectAIRoute` with a `LOCAL_ONLY` request and only a `REMOTE` route; `selectAIRoute` throws `No enabled AI route satisfies capability, privacy, and cost budget`, which the test does not catch. CI is green only because the suite is imported but **not registered** in the `runners` array (see tracker finding F-1). The bridge also builds on the `ai-orchestration` router, which the live app does not use (finding F-3), so it should wait for the MIO-PRV-02.01 router decision. |

## 6. Branches (540)

| Prefix | Count |
|---|---:|
| feat/ | 303 |
| creative/ | 113 |
| milestone/ | 36 |
| music-studio/ | 33 |
| photo/ | 13 |
| mio/ | 10 |
| feature/ | 10 |
| fix/ | 7 |
| test/ | 4 |
| integration/ | 3 |
| refactor/ | 2 |
| docs/, audit/, claude/ | 1 each |
| root (`main`, `tmp`, `tmp2`) | 3 |

Most branches are per-milestone working branches whose content is on `main` in squashed form (e.g. 3D Modeling V1.0–V6.0, Animation V1/V2.x, Creative Audio 10.x). Branch deletion is irreversible and is deferred to MIO-PRV-00.09, which will tag each branch tip under `archive/` before any deletion and requires owner approval.

## 7. Recommended actions (pending owner approval)

1. **MIO-PRV-00.03** — Close the 55 SUPERSEDED/DUPLICATE PRs with a comment linking this audit.
2. **MIO-PRV-00.04** — Rebase and gate the 5 READY PRs one at a time (#502, #418, #423, #424, #428).
3. **MIO-PRV-00.05** — Resolve #427's single conflict, register its suites, gate, merge; then #431.
4. **MIO-PRV-00.06** — Review the 5 CONFLICTED PRs; port or close each with a reason.
5. **MIO-PRV-00.07** — Write a Motion V2 re-port plan for #265/#356.
6. **MIO-PRV-00.08** — Fix #520's test; hold the merge until MIO-PRV-02.01.
