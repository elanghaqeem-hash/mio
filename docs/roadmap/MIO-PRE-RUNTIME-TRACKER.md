# MIO Pre-Runtime Development Tracker

Program: MIO-PRV (Pre-Runtime → Mio AI Runtime V1 entry gate)
Tracker created: 2026-10-11 · Baseline `main` HEAD: `802af2db` (T-17)
Companion documents: [PR consolidation audit](./MIO-PRV-00-PR-CONSOLIDATION-AUDIT.md) · [Runtime V1 readiness gate](./MIO-AI-RUNTIME-V1-READINESS.md)

Status vocabulary: IMPLEMENTED · VERIFIED · INTEGRATED · DEPLOYED · PRODUCTION-READY · PARTIAL · BLOCKED · NOT STARTED. A status is only recorded with the evidence cited next to it. Checkpoint documents, commit messages, and earlier conversations are **not** evidence on their own.

Decision hierarchy: Security & data integrity → Verified repository state → Approved architecture → Existing roadmap → Integration requirements → New features.

---

## 1. Verified baseline (2026-10-11, `main` @ `802af2db`)

Commands were run in a clean checkout with Node 22.22.0 and `npm ci`.

| Check | Command | Result |
|---|---|---|
| Install | `npm ci` | PASS |
| Typecheck | `npx tsc -b` | PASS (exit 0) |
| Lint | `npm run lint` (oxlint) | PASS: 0 errors, warnings only |
| Web build | `npm run build` | PASS (main chunk 511 kB > 500 kB advisory) |
| Electron build | `npm run build:electron` | PASS |
| Full test | `npm test` (after build) | PASS: deployment contract, promotion selftest, release smoke, manifest, **1541/1541** |
| Benchmark | `npm run benchmark:file-scanner` | PASS: 5,000 synthetic files, median 6.85 ms (excludes disk I/O and media decoding) |
| GitHub CI on `main` | Mio CI, MIO Validation Gate, Cloudflare Web Build, Training Runner Contract | all `success` for `802af2db` |

`npm test` requires `dist/` and `dist-electron/` to exist (the release-smoke step checks build output), so it must run after `build` and `build:electron`, as CI does.

## 2. Audit findings

| ID | Severity | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-1 | **High (gate integrity)** | 13 test suites never ran in CI. 8 were imported into `src/tests/runAllTests.ts` but missing from the `runners` array (incl. **T-15 AI orchestration, T-16 privacy/security, T-17 performance**, drawing runtime/commit/renderer, FABRIK, IK authoring); 5 were never imported (mesh transform/gizmo/preview, animation gesture controller). | `grep` of the imports against the `runners` array; each suite was then run directly. | **Fixed in MIO-PRV-00.02**: all registered, plus a harness self-check. |
| F-2 | Medium (data integrity) | `DrawingRuntime.commitStroke()` claimed to keep a recovery session after a failed commit, but left it in `COMMITTED` state, so it could neither be retried nor cancelled (`DRAWING_STROKE_NOT_ACTIVE`). Hidden by F-1. | `runCreativeDrawingCommitRuntimeTests` threw when run directly. | **Fixed in MIO-PRV-00.02**, with a retry regression test. |
| F-3 | High (architecture) — **resolved by ADR-001 / PRV-02** | Two model-routing systems. The live app routes through `src/agents/ModelRouter.ts` (local heuristic, Ollama, MIO Local, secure proxy). The T-15 `src/ai-orchestration/*` layer (cost ledger, circuit breaker, bounded fallback, provenance) is referenced only by its own tests. T-16's `RemoteProcessingPolicy` and `SecretRedaction` are only used by that unintegrated layer. | Import graph: `selectAIRoute`, `AICostLedger`, `executeWithBoundedFallback` have no non-test importers outside `src/ai-orchestration`. | MIO-PRV-02.01 must pick one router and fold the other in. |
| F-4 | Medium (integration) | File Intelligence T-3 to T-11 engines (image, video, audio, document, 3D, semantic, relationship graph, smart search, organizer) are not consumed by the app or the agent. Only `LexicalSearch` and the safe-mutation flow are used, from `src/modes/files/FileOrganizationView.tsx`. | Import graph of `src/file-intelligence/*`. | MIO-PRV-04 / MIO-PRV-00.08 (T-18). |
| F-5 | Medium (repository) | `main` history starts 2026-09-26; PRs created earlier share no ancestor with `main`. 70 open PRs, of which 55 are superseded or duplicate. 540 remote branches. | See the PR audit. | MIO-PRV-00.03 to 00.09. |
| F-6 | Medium (traceability) | The T-15, T-16, and T-17 checkpoint docs state "COMPLETE" and "passed all CI", but their suites never executed (F-1). They do pass when run directly (7/7, 8/8, 7/7). | Direct runs on 2026-10-11. | Errata added to those checkpoint docs. Status recorded here as VERIFIED (2026-10-11), NOT INTEGRATED. |
| F-7 | Low (CI) — **fixed in 00.10** | CI Node versions differ: `ci.yml` 24, `training-runner-contract.yml` 24, `mio-validation.yml` 22, Cloudflare build `.node-version` = 22.16.0. | Workflow files. | MIO-PRV-00.10. |
| F-8 | Info | Voice V1 production acceptance is `blocked` by design until physical-device (iOS Safari, desktop Safari, Chromium) and licensed-provider audio evidence exist. CI cannot produce that evidence. | `docs/MIO_VOICE_V1_PRODUCTION_ACCEPTANCE.md`, `docs/MIO_VOICE_V1_DEVICE_EVIDENCE_RECORD.md`. | MIO-PRV-07 (needs the owner's devices). |
| F-9 | Info | No Computer Use subsystem, unified execution-trace model, unified core contract set, or end-to-end integration suite exists yet. | No such modules on `main`. | MIO-PRV-01, 09, 10, 11. |
| F-10 | Low | `DrawingRuntime` (Drawing 0.2/0.3) is used only by tests and is not wired into the Drawing UI. | Import graph. | MIO-PRV-08. |
| F-11 | Low | The file-scanner benchmark is synthetic; there is no real-disk or media-decoding benchmark. | Benchmark output note. | MIO-PRV-04. |

## 3. Roadmap inventory (existing tracks found on `main`)

| Track | Docs | Latest on `main` | Open / pending |
|---|---|---|---|
| TP-0.x platform foundation (task runtime, scheduler, resource governance, scoped authorization, capability gateway, desktop bridges, knowledge, research, deployment, routing, MIO Local, training/promotion/provenance) | `docs/checkpoints/TP-0.7` … `TP-0.70` | TP-0.70 | — |
| T-x Multimodal File Intelligence | `docs/checkpoints/T-1` … `T-17` | T-17 | T-18 agent integration (#520, blocked) |
| Mio Voice V2 → V4.x → RC1 → V1 | `docs/MIO_*VOICE*`, `docs/MIO_V4_*` | V1 boundary/evidence/acceptance evaluators | V1 production acceptance blocked on device evidence; Cloudflare Workers AI TTS (#502) |
| Creative Document Kernel / Studios | `CREATIVE-1.0` … `1.8`, `2.2`, `10.0`, `10.1` | 1.8 / 10.1 | — |
| 3D Modeling | `3D-MODELING-V1.0` … `V6.0`, `3D-MODELING-ROADMAP-V5.5-V6.0` | V6.0 closed | — |
| 3D Animation | test suites (V1, V2.x IK/FABRIK) | V2.x | V2.23 (#424) |
| Graphic / Motion | `CREATIVE-1.5`, Graphic V3.x | Graphic V3.2.x | V3.2.4 (#428); Motion V2 (#265, experimental) |
| Drawing | `CREATIVE-1.3` | 0.1–0.3 | 0.4 brush engine (#418) |
| Music / SFX | `CREATIVE-1.6`, `10.0`, `10.1` | Music 10.x automation | Music 10.63 (#423); SFX 10.18 (#427), 10.19 (#431) |
| Photo | `CREATIVE-1.4` | PHOTO-01 domain contract | further photo editing |

None of these targets is removed by this program. MIO-PRV adds the cross-cutting runtime work they need to converge on Runtime V1.

## 4. Subsystem status matrix (evidence as of 2026-10-11)

| Subsystem | Key modules | Status | Evidence / gap |
|---|---|---|---|
| Agent orchestrator | `src/agents/AgentOrchestrator.ts` | IMPLEMENTED · VERIFIED · INTEGRATED | Used by the chat path; uses `ModelContextAssembler` |
| Model routing (live) | `src/agents/ModelRouter.ts`, `src/intelligence/model/*`, `functions/api/ai/generate.ts` | IMPLEMENTED · VERIFIED · INTEGRATED · PARTIAL vs PRV-02 | Monthly paid-cloud budget, circuit breaker, local-only fallback, provenance now live (ADR-001). Open: capability registry, multi-local routes |
| AI orchestration & cost (T-15) | `src/ai-orchestration/*` | IMPLEMENTED · VERIFIED · **INTEGRATED** (ledger, circuit breaker, provenance via `ModelRouter`) | F-3 resolved by ADR-001 |
| Task runtime / scheduler / integrity | `src/orchestrator/*` | IMPLEMENTED · VERIFIED · INTEGRATED | TP-0.7/0.8 suites registered |
| Permission / capability / gateway | `PermissionEngine`, `CapabilityRegistry`, `SecureServiceGateway`, `PolicyEngine` | IMPLEMENTED · VERIFIED · INTEGRATED | TP-0.10/0.11 suites |
| Emergency Stop | `src/core/EmergencyStop.ts` | IMPLEMENTED · VERIFIED · INTEGRATED | PRV-06: aborts tasks, all model calls, and voice; reaches the Electron main process; audited. Creative work stops between steps only (S-8) |
| Context assembly | `src/intelligence/context/*` | IMPLEMENTED · VERIFIED · **INTEGRATED** | Live chat goes through `UnifiedContextEngine` (PRV-03.06); file-intelligence/graph sources pending PRV-04 |
| Memory | `src/memory/*`, `src/security/MemoryManager.ts`, `GovernedMemoryActions.ts` | IMPLEMENTED · VERIFIED · INTEGRATED | Governance suites registered |
| Research / evidence | `src/research/*`, `EvidenceGrounding.ts`, `src/project/EvidencePackage.ts` | IMPLEMENTED · VERIFIED · INTEGRATED | — |
| File Intelligence T-1…T-14 | `src/file-intelligence/*` | IMPLEMENTED · VERIFIED · **PARTIAL integration** | F-4 |
| Privacy hardening (T-16) | `RemoteProcessingPolicy`, `SecretRedaction` | IMPLEMENTED · VERIFIED (2026-10-11) · **NOT INTEGRATED** | F-3 |
| Performance (T-17) | `BoundedLruCache`, `BoundedTaskScheduler` | IMPLEMENTED · VERIFIED (2026-10-11) · PARTIAL | LRU used by `FileScanCache`; scheduler unused |
| Voice | `src/services/voice/*`, `functions/api/voice/*` | IMPLEMENTED · VERIFIED · INTEGRATED · **production acceptance BLOCKED** | F-8. Workers AI (MeloTTS) provider added in 00.04 (opt-in; no `id-ID`) |
| 3D Modeling | `src/modes/studio3d/*` | IMPLEMENTED · VERIFIED · INTEGRATED | V6.0 closeout merged |
| 3D Animation | `src/modes/animation/*` | IMPLEMENTED · VERIFIED · INTEGRATED | V2.23 pending |
| Graphic / Motion | `src/creative/GraphicMotionWorkspace.ts`, `MotionWorkspace.ts` | IMPLEMENTED · VERIFIED · INTEGRATED · Motion V2 NOT STARTED on `main` | #265 experimental |
| Drawing | `src/creative/drawing/*` | IMPLEMENTED · VERIFIED · **PARTIAL** | F-10; 0.4 brush engine ported in 00.04, also not yet wired into the UI |
| Music / SFX | `src/creative/AudioWorkspace.ts`, `src/modes/music`, `src/modes/sfx` | IMPLEMENTED · VERIFIED · INTEGRATED | SFX 10.18 sample/waveform and 10.19 timeline ported in 00.05 |
| Photo | `src/creative/photo/*` | IMPLEMENTED (domain contract) · PARTIAL | editing features pending |
| Core runtime contracts (`MioCapabilityRequest` etc.) | `src/contracts/*` | IMPLEMENTED · VERIFIED · not yet emitted natively | v1 contracts, validators, adapters (PRV-01); native emission in PRV-05/10 |
| Unified capability protocol | `CapabilityRegistry`, `ToolRegistry`, `ToolRouter` | PARTIAL | No per-capability manifest with I/O schema, limits, cancellation |
| Computer Use | `DesktopBrowserGateway` (governed read only), `workspaceSandbox` | NOT STARTED | F-9 |
| Observability / tracing | `ExecutionLedger`, `SecurityAuditLog`, `MutationAuditLog`, `AIProvenance` | PARTIAL | No shared trace ID or cost/latency model |
| MioBench integration suite | `src/tests/*` (unit + contract) | NOT STARTED | 1610 unit/contract assertions; no end-to-end workflows |
| Deployment | Cloudflare Pages build, Windows RC targets | VERIFIED (contract checks) | Post-deploy verification needs a live URL |

## 5. Dependencies and critical path

```
PRV-00 Consolidation ──► PRV-01 Contract freeze ──► PRV-02 Router V2 ──► PRV-03 Context engine ──► PRV-05 Capability protocol ──► PRV-10 Observability ──► PRV-11 MioBench ──► Runtime V1 gate
                              │                         ▲                     ▲                         │
                              ├──► PRV-06 Security regression (runs alongside every milestone; freeze before PRV-11)
                              ├──► PRV-04 File Intelligence hardening ────────┘                         │
                              └──► PRV-09 Computer Use foundation (needs 05 + 06) ◄─────────────────────┘
Parallel tracks (do not block the critical path unless in Runtime V1 scope): PRV-07 Voice, PRV-08 Creative adapters
```

**Critical path:** 00 → 01 → 02 → 03 → 05 → 10 → 11.

## 6. Backlog

Each row's acceptance criteria are the minimum. Test evidence must be a CI run or command output referenced in the task report.

### MIO-PRV-00 — Repository consolidation
Exit gate: stable baseline; each open PR has a clear purpose; every important change is tracked.

| Task | Name | Depends on | Acceptance criteria | Status |
|---|---|---|---|---|
| 00.01 | Comprehensive repository & roadmap audit | — | Baseline verified by commands; all open PRs classified by content; subsystem matrix; backlog | **DONE** (this document + PR audit) |
| 00.02 | Test gate integrity | 00.01 | Every exported test runner executes in `npm test`; a harness self-check fails on unregistered or duplicate runners; failures exposed by the change are fixed | **DONE on branch**, PR pending (§7.2) |
| 00.03 | Close superseded/duplicate PRs | 00.01, owner approval | 55 PRs closed, each with a comment linking the audit | NOT STARTED — **needs owner approval** |
| 00.04 | Integrate ready PRs (#502, #418, #423, #424, #428) | 00.02 | Each ported onto `main` as its own commit, suites registered, full gate green | **DONE on branch** (§7.3); originals become SUPERSEDED once #521 merges |
| 00.05 | SFX 10.18/10.19 consolidation (#427 → #431) | 00.02 | Conflict resolved, SFX suites registered and green | **DONE on branch** (§7.4) |
| 00.06 | Review conflicted creative PRs (#182, #198, #214, #287, #368) | 00.02 | Each ported or closed with a written reason | **DONE on branch** (§7.5) |
| 00.07 | Motion V2 re-port plan (#265/#356) | 00.02 | Written plan: which files to port, in what order, with what test parity | **DONE**: [plan](./MIO-PRV-00.07-MOTION-V2-REPORT-PLAN.md); phases tracked as MIO-PRV-08.M1–M4 |
| 00.08 | T-18 agent bridge (#520) | 00.02, 02.01 | Failing test fixed; bridge targets the router chosen in 02.01 | **DONE on branch**: bridge ported into `src/agents/`, AI_ROUTE via `ModelRouter.describeRoute()`, invalid input returns `REJECTED`, 3 tests registered. T-18.02+ (dispatcher wiring) remain in the T-18 checkpoint. |
| 00.09 | Stale branch triage | 00.03 | Each branch tip tagged `archive/<name>` before any deletion; deletion only with approval | NOT STARTED — **needs owner approval** |
| 00.10 | CI hygiene | — | One Node version across workflows (pin to `.node-version`); lint warning burn-down plan; bundle split for the >500 kB chunk | **PARTIAL**: Node pinned in all 4 workflows (F-7 fixed). The app entry chunk is split: React is now its own `react-vendor` chunk, taking the entry from 518 kB, over the release-smoke 500 KiB budget after PRV-02, down to 308 kB. Workspace modes were already lazy. Open: lint warning burn-down |

### MIO-PRV-01 — Core runtime contract freeze
Exit gate: core contracts usable without depending on any subsystem's UI.

| Task | Name | Acceptance criteria |
|---|---|---|
| 01.01 | Contract inventory | Map existing types (`src/types/*`, `ai-orchestration`, `file-intelligence/contracts.ts`, voice) to the target contracts; list overlaps — **DONE on branch** (§7.6) |
| 01.02 | Define `MioCapabilityRequest/Result`, `MioContext`, `MioEvidence`, `MioPermission`, `MioArtifact`, `MioExecutionTrace`, `MioRuntimeError` (v1) | Typed, versioned (`schemaVersion`), runtime validators with no new runtime dependency, no UI imports — **DONE on branch** (§7.6) |
| 01.03 | Adapters from existing types | Existing subsystems expose contract-shaped values without behavior change; all existing tests green — **DONE on branch** (§7.6) |
| 01.04 | Compatibility tests | Round-trip, rejection of malformed input, version-mismatch handling — **DONE on branch** (§7.6) |

### MIO-PRV-02 — Model Router V2
Exit gate: local/cloud routing follows policy, cost limits, and test results.

| Task | Name | Acceptance criteria |
|---|---|---|
| 02.01 | Router unification decision (F-3) | ADR choosing one router; the other folded in; no duplicate routing logic — **DONE on branch**: [ADR-001](./ADR-001-MODEL-ROUTER-UNIFICATION.md) ACCEPTED (D-1a, D-2a) and implemented (§7.7) |
| 02.02 | Model capability registry | Capabilities, context limits, locality, and cost per provider/model, sourced from configured providers only |
| 02.03 | Cost governance on the live path | Per-task and monthly budgets enforced fail-closed; paid routes off unless explicitly enabled — **DONE on branch** (monthly; §7.7). Per-task USD caps remain open. |
| 02.04 | Resilience | Provider timeout, circuit breaker, deterministic fallback order, provider health — **PARTIAL**: circuit breaker + local-only fallback done (§7.7); multi-local-route order open |
| 02.05 | Privacy-safe fallback | Tests prove no cloud fallback for `LOCAL_ONLY` / private data — **DONE on branch**: fallback never targets any cloud provider (D-2a, tested) |

### MIO-PRV-03 — Unified Context Engine
Exit gate: relevant context without cross-project leakage, and external content never gains authority.

| Task | Name | Status |
|---|---|---|
| 03.01 | Context-source adapters (governed memory + project knowledge via the existing assembler, research evidence, task state, permission state, active creative document) | **DONE on branch** (§7.8). File-intelligence and relationship-graph sources wait on PRV-04. |
| 03.02 | Relevance ranking + one shared budget with per-kind caps | **DONE on branch** |
| 03.03 | Provenance (`MioEvidence` per item, drop reasons) + trust classification | **DONE on branch** |
| 03.04 | Project-isolation tests | **DONE on branch** |
| 03.05 | Prompt-injection regression set | **DONE on branch**, including a fix for a real boundary-spoofing vulnerability |
| 03.06 | Wire the engine into the live chat path (`AgentOrchestrator`), keeping `EvidenceGrounding` working | **DONE on branch** (§7.9) |

### MIO-PRV-04 — Multimodal File Intelligence hardening
Exit gate: ingestion, indexing, search, and relationship retrieval meet measured benchmarks.

04.01 integrate T-3…T-11 engines behind the capability protocol · 04.02 corrupted/unsupported file handling · 04.03 size/resource limits · 04.04 incremental indexing + rebuild/migration · 04.05 cancellation + cache consistency · 04.06 real-disk benchmark (replacing the synthetic-only benchmark).

### MIO-PRV-05 — Unified Capability Protocol
Exit gate: the agent discovers and invokes capabilities through one controlled protocol.

05.01 capability manifest schema (I/O schema, risk level, permissions, limits, cancellation, audit) · 05.02 manifests for files, research, memory, model inference, creative, voice · 05.03 execution through `CapabilityRegistry` + `SecureServiceGateway` · 05.04 negative tests (unknown capability, schema violation, permission denial).

### MIO-PRV-06 — Security regression & governance freeze
Exit gate: no open critical/high finding affecting Runtime V1; regression gate passes.

06.01 consolidate the existing security suites into a named regression gate · 06.02 add missing cases: path traversal, SSRF, secret exposure, cross-project leakage, resource exhaustion · 06.03 Emergency Stop cancellation coverage across task, model, voice, and creative · 06.04 audit completeness check.

### MIO-PRV-07 — Mio Voice runtime stabilization (parallel)
07.01 integrate #502 (Workers AI TTS) with gateway tests · 07.02 STT path review · 07.03 physical-device evidence runs on iOS Safari, desktop Safari, and Chromium (**needs the owner's devices**) · 07.04 latency/interruption/fallback acceptance from measured data. Consent rule: no voice cloning or speaker imitation without documented rights.

### MIO-PRV-08 — Creative capability adapters (parallel)
08.M1–M4 Motion V2 re-port in four phases (see the [plan](./MIO-PRV-00.07-MOTION-V2-REPORT-PLAN.md); #265's own core fails 4 checks, including a grouped-move undo defect) · 08.01 adapter contract over the Creative Document Kernel · 08.02 one validated structured-instruction workflow per in-scope engine · 08.03 wire `DrawingRuntime` into the Drawing UI (F-10) · 08.04 keep the active creative roadmaps (advanced 3D, Drawing brush engine, Motion V2, Music/SFX/Photo) on their own tracks.

### MIO-PRV-09 — Governed Computer Use foundation
09.01 action taxonomy (observe, navigate, read, low-risk, mutating, sensitive) · 09.02 observe/read-only implementation behind the sandbox · 09.03 approval flow for mutating actions; irreversible, financial, credential, and external-submission actions denied by policy · 09.04 audit + cancellation tests.

### MIO-PRV-10 — Observability, recovery & cost governance
10.01 `MioExecutionTrace` emitted by router, tools, permissions, and capabilities · 10.02 token, cost, and latency accounting · 10.03 checkpoint + recovery that never auto-retries mutating actions with an uncertain outcome.

### MIO-PRV-11 — MioBench integration & production gate
11.01 harness for the 15 required end-to-end workflows · 11.02 negative, concurrency, and performance scenarios · 11.03 gate wired into CI.

## 7. Task reports

### 7.1 MIO-PRV-00.01 — Comprehensive Repository & Roadmap Audit

| Field | Detail |
|---|---|
| Milestone | MIO-PRV-00 — Repository Consolidation |
| Objective | Establish an evidence-based baseline, classify all open work, and produce the consolidated roadmap and backlog |
| Baseline | `main` @ `802af2db`; 70 open PRs; 540 branches; 0 open issues |
| Implemented | This tracker, the [PR audit](./MIO-PRV-00-PR-CONSOLIDATION-AUDIT.md), the [readiness gate](./MIO-AI-RUNTIME-V1-READINESS.md), and errata on the T-15/T-16/T-17 checkpoints |
| Files Changed | `docs/roadmap/*` (new), `docs/checkpoints/T-15-…`, `T-16-…`, `T-17-…` (errata) |
| Test Results | Baseline in §1; per-PR content classification in the PR audit |
| Security Impact | None (documentation). Identified that T-16 privacy controls are not on the live path (F-3). |
| Dependencies | — |
| Acceptance Gate | **PASS** |
| Commit/PR | Branch `claude/mio-runtime-v1-prep-x0bpzv` |
| Remaining Gaps | Owner decisions for 00.03 and 00.09; branch-level (non-PR) triage |
| Next Task | MIO-PRV-00.02 |

### 7.2 MIO-PRV-00.02 — Test Gate Integrity

| Field | Detail |
|---|---|
| Milestone | MIO-PRV-00 — Repository Consolidation |
| Objective | Guarantee that every test suite in the repository runs in CI (F-1), and fix what that exposes |
| Baseline | 13 suites never executed; `npm test` reported 1541/1541 |
| Implemented | Registered all 13 suites in `runAllTests.ts`. Added `testHarnessIntegrityTests.ts`, which fails if any exported `run*` function in `src/tests` is not in `runners` or is registered twice. Fixed F-2: added `DrawingStrokeSession.reopenAfterFailedCommit()`; `DrawingRuntime.commitStroke()` now reopens the session when the commit plan fails; removed two no-op try/catch wrappers (lint `no-useless-catch`). Added a retry regression case. |
| Files Changed | `src/tests/runAllTests.ts`, `src/tests/testHarnessIntegrityTests.ts` (new), `src/tests/creativeDrawingCommitRuntimeTests.ts`, `src/creative/drawing/DrawingRuntime.ts`, `src/creative/drawing/DrawingStrokeSession.ts` |
| Test Results | `tsc -b` PASS · `oxlint` 0 errors · `npm run build` + `build:electron` PASS · `npm test` **1610/1610** PASS. Negative checks: removing a runner from `runners` fails with `Unregistered test runners: runMeshGizmoStateTests`; reverting the drawing fix fails with `DRAWING_STROKE_NOT_ACTIVE`. |
| Security Impact | Positive: T-16 privacy/security assertions now run on every PR |
| Dependencies | 00.01 |
| Acceptance Gate | **PASS** locally; CI NOT VERIFIED until a PR runs |
| Commit/PR | Branch `claude/mio-runtime-v1-prep-x0bpzv` (PR not yet opened) |
| Remaining Gaps | Open PRs that add suites (e.g. #520) must also register them, which the new self-check now enforces |
| Next Task | MIO-PRV-00.03 (needs owner approval) and 00.04, which can start in parallel |

### 7.3 MIO-PRV-00.04 — Integrate Ready PRs

| Field | Detail |
|---|---|
| Milestone | MIO-PRV-00 — Repository Consolidation |
| Objective | Land the 5 READY PRs on current `main` without blind merges |
| Baseline | #418, #423, #424, #428, #502 open; none on `main`. Their branches can only be integrated by porting, because most lack shared history with `main`. |
| Implemented | One commit per PR, attributed to the original author: **#418** Drawing 0.4 brush engine (its suite was imported but unregistered, and the 00.02 self-check caught it). **#502** Workers AI TTS, with review fixes: MeloTTS-only model allowlist, a 30 s timeout on the binding call, result normalization and media-type validation (raw stream, `Response`, or base64 JSON), no error-detail leakage, a restored `endpoint` null guard that the original had lost, and a new 7-case gateway suite against the real handlers. **#424** Animation V2.23 IK handle focus. **#423** Music 10.63 offline AUX/FX automation parity. **#428** Graphic V3.2.4 segment hit & insert. |
| Files Changed | `src/creative/drawing/DrawingBrush*.ts`, `functions/api/voice/{synthesize,_workersAi,_session}.ts`, `.env.example`, `src/modes/animation/Animation3DViewport{,Bridge}.tsx`, `src/modes/music/MusicStudioView.tsx`, `src/modes/graphic/GraphicStudioView.tsx`, tests |
| Test Results | `tsc -b` PASS · `oxlint` 0 errors · build web + Electron PASS · `npm test` **1625/1625** |
| Security Impact | The Workers AI path fails closed (unverified model counts as unconfigured; timeout returns 504; non-audio is rejected; binding errors are not echoed). Importing `synthesize.ts` into tests brings the voice gateway under typecheck for the first time; this exposed one latent type error in `_session.ts` (type-only fix). |
| Dependencies | 00.02 |
| Acceptance Gate | **PASS** locally; CI via #521 |
| Commit/PR | `3b6e1b7`, `83869dd`, `39b39c4`, `c6e032b`, `57d2bb8` in [#521](https://github.com/elanghaqeem-hash/mio/pull/521) |
| Remaining Gaps | #428 and #424 are UI changes verified by typecheck and source-contract tests only; they need a manual browser check. Workers AI usage beyond the free daily allocation is billed by Cloudflare and should only be enabled deliberately. MeloTTS has no Indonesian voice. |
| Next Task | 00.05 (SFX 10.18 #427 → 10.19 #431) |

### 7.4 MIO-PRV-00.05 — SFX 10.18/10.19 Consolidation

| Field | Detail |
|---|---|
| Milestone | MIO-PRV-00 — Repository Consolidation |
| Objective | Land the authoritative SFX 10.18 (#427) and the stacked 10.19 (#431) on current `main` |
| Baseline | Six SFX 10.18 iterations open (#324, #354, #382, #393, #410, #427) plus #431; no `SFXSample*`, `SFXUnifiedGraph`, or `SFXTimeline*` on `main` |
| Implemented | **#427:** sample import/relink, region editing (trim, split, move, fade, reverse, loop, pitch), waveform peak pyramid, shared DSP graph, SFX Studio UI. The original registered none of its 4 suites; all are now registered. **Review fix:** import and relink had no resource bound (an hour of 48 kHz stereo decodes to about 1.4 GB of Float32), so files over 64 MB are now rejected before reading and decoded audio over 600 s is rejected after decoding, through the existing UI error path. Added `sfxSampleResourceLimitTests`. **#431:** SFX timeline with zoom, grid/region snap, multi-select group drag, markers, and playhead. **Review fix:** removed a ref read during render (stale viewport width) with no behavior change, since its consumers use only `pixelsPerSecond`. |
| Files Changed | `src/creative/SFX{SampleRegistry,SampleRuntime,SampleWorkspace,UnifiedGraph,TimelineWorkspace}.ts`, `src/creative/AudioWorkspace.ts`, `src/types/creative.ts`, `src/modes/sfx/SFXStudioView.tsx`, 6 SFX test suites |
| Test Results | `tsc -b` PASS · `oxlint` 0 errors · build web + Electron PASS · `npm test` **1668/1668** |
| Security Impact | Positive: bounded memory on user-supplied audio (the PRV-06 resource-exhaustion class) |
| Dependencies | 00.02 |
| Acceptance Gate | **PASS** locally; CI via #521 |
| Commit/PR | `6de1858`, `c70d2e1` in [#521](https://github.com/elanghaqeem-hash/mio/pull/521) |
| Remaining Gaps | Owner decision: should manually built sample projects honor the 30 s SFX limit that `ResultValidator.validateSFX` applies to AI-generated patches? Imports currently extend `patch.duration` past 30 s. The timeline UI still needs a manual browser check. |
| Next Task | 00.06 (review the 5 conflicted creative PRs) |

### 7.5 MIO-PRV-00.06 — Review Conflicted Creative PRs

| Field | Detail |
|---|---|
| Milestone | MIO-PRV-00 — Repository Consolidation |
| Objective | Decide port vs. superseded for #182, #198, #214, #287, #368 with written evidence |
| Baseline | 5 PRs that don't apply cleanly because `main` evolved the same files |
| Implemented | #182, #198, #214, #287 judged **SUPERSEDED** by symbol-level comparison (see the PR audit §5.4). #368 **reimplemented**: live music playback now follows linear/smooth automation with `setValueAtTime` + `linearRampToValueAtTime` (overlap-safe) via `planMusicAutomationStep`/`applyMusicAutomationStep`, using the shared `mapMusicAutomationValue`. #368's own `setValueCurveAtTime` approach was rejected because overlapping per-step curves throw `NotSupportedError`. |
| Files Changed | `src/creative/AudioWorkspace.ts`, `src/modes/music/MusicStudioView.tsx`, `src/tests/musicLiveAutomationTests.ts` (new), `src/tests/runAllTests.ts`, roadmap docs |
| Test Results | `tsc -b` PASS · `oxlint` 0 errors · build web + Electron PASS · `npm test` **1673/1673** |
| Security Impact | None |
| Dependencies | 00.02, 00.04 (#423 introduced the shared mapper) |
| Acceptance Gate | **PASS** locally; CI via #521 |
| Commit/PR | `63243aa` in [#521](https://github.com/elanghaqeem-hash/mio/pull/521) |
| Remaining Gaps | Live automation needs a listening check in a browser. Music roadmap gap: per-note duplication has no UI (from #182). |
| Next Task | 00.07 (Motion V2 re-port plan) |

### 7.6 MIO-PRV-01 — Core Runtime Contract Freeze

| Field | Detail |
|---|---|
| Milestone | MIO-PRV-01 — Core Runtime Contract Freeze |
| Objective | One versioned, validated, UI-independent set of runtime contracts |
| Baseline | No unified contracts; each subsystem had its own request, result, evidence, and trace shapes (inventory in [MIO-PRV-01-CORE-CONTRACTS.md](./MIO-PRV-01-CORE-CONTRACTS.md) §1) |
| Implemented | `MioContext`, `MioPermission`, `MioCapabilityRequest`, `MioCapabilityResult`, `MioEvidence`, `MioArtifact`, `MioExecutionTrace`, `MioTraceSpan`, `MioRuntimeError` (schema v1), reusing the existing domain enums with compile-time exhaustiveness guards. Hand-written fail-closed validators (bounded, versioned, secret-key rejection, result/trace consistency, `UNKNOWN` mutations never retryable). Six adapters from existing types. |
| Files Changed | `src/contracts/*` (new), `src/tests/mioContractTests.ts` (new), `src/tests/runAllTests.ts`, `docs/roadmap/MIO-PRV-01-CORE-CONTRACTS.md` (new) |
| Test Results | `tsc -b` PASS · `oxlint` 0 errors · `npm test` **1684/1684** (11 new contract tests). Negative check: adding an unmapped `MioSystemMode` member fails `tsc` at the exhaustiveness guard. |
| Security Impact | Positive: contracts encode no-secrets, untrusted-evidence, and no-blind-retry rules that PRV-03/05/10 build on |
| Dependencies | 00.02 |
| Acceptance Gate | **PASS** for the PRV-01 exit gate (usable without any subsystem UI); CI via #521 |
| Commit/PR | [#521](https://github.com/elanghaqeem-hash/mio/pull/521) |
| Remaining Gaps | Subsystems are adapted, not yet native producers (PRV-05/10). `ToolExecutionContext`/`CapabilityExecutionContext` duplication to retire in PRV-05. |
| Next Task | MIO-PRV-02.01 router unification decision (ADR), which also unblocks 00.08 (T-18) |

### 7.7 MIO-PRV-02 — Model Router V2 (ADR-001 implementation)

| Field | Detail |
|---|---|
| Milestone | MIO-PRV-02 — Model Router V2 |
| Objective | One router with cost and privacy governance on the live path |
| Baseline | Live `ModelRouter` had no USD budget, circuit breaker, or provenance; the T-15 layer that had them was unintegrated (F-3) |
| Implemented | See [ADR-001 §6](./ADR-001-MODEL-ROUTER-UNIFICATION.md). Paid cloud off at $0 budget (D-1a), with free OpenRouter tiers still usable. Persistent monthly ledger. Budget and circuit checks run before any permission prompt. Local-only fallback (D-2a). Per-provider circuit breaker. Secret-free provenance. `trySelectAIRoute`. Budget panel in Settings. Fix: `AICostLedger.settle` no longer drops spend past the limit. |
| Files Changed | `src/agents/ModelRouter.ts`, `src/ai-orchestration/{CloudBudget.ts (new),AICostLedger.ts,AIOrchestration.ts}`, `src/types/models.ts`, `src/settings/SystemPreferences.ts`, `src/modes/settings/SettingsView.tsx`, `src/tests/{modelRouterBudgetTests.ts (new),modelRouterTests.ts,aiOrchestrationTests.ts,runAllTests.ts}` |
| Test Results | `tsc -b` PASS · `oxlint` 0 errors · `npm test` **1695/1695** (9 new router budget/resilience tests). Browser check (Playwright, dev server): budget panel renders, budget persists across reload, free model is labelled free, no page errors. |
| Security Impact | Positive: no paid or unapproved cloud spend; a failing or over-budget provider is never prompted for; fallback never sends data to an unselected provider |
| Dependencies | 01, ADR-001 decisions |
| Acceptance Gate | **PASS** locally for 02.01/02.03/02.05; 02.04 PARTIAL; CI via #521 |
| Commit/PR | [#521](https://github.com/elanghaqeem-hash/mio/pull/521) |
| Remaining Gaps | **Intended behavior change:** existing paid-cloud users must set a budget. Spend is an upper-bound estimate (conservative price ceilings), not billing data. Open: per-task USD caps, per-model price overrides, multi-local-route fallback ordering (02.02/02.04). |
| Next Task | MIO-PRV-00.08 (T-18 bridge, now unblocked) |

### 7.8 MIO-PRV-03 — Unified Context Engine (03.01–03.05)

| Field | Detail |
|---|---|
| Milestone | MIO-PRV-03 — Unified Context Engine |
| Objective | One context layer: isolation, trust, provenance, injection resistance, one budget |
| Baseline | TP-0.45 `ModelContextAssembler`: project knowledge + governed memory with separate per-source budgets. No task/permission/creative state. Data blocks were spoofable (below). |
| Implemented | **Security fix first (commit `36aec8d`):** untrusted source text could close its data block early and forge attributes (`trust="VERIFIED"`) in the project-knowledge, memory and external-content serializers. Reproduced, then fixed with `ContextBoundary` (tag neutralization and attribute escaping), with 5 regression tests that fail against the old code. **Engine:** `UnifiedContextEngine` + `selectContext`: project isolation (drops other-project candidates, and owner-less ones except external research); contract validation; RESEARCH/FILE/MODEL/TOOL content forced `UNTRUSTED`; injection-pattern flagging that downgrades trust and always ranks flagged items after clean ones; de-duplication; deterministic ranking with runtime-state priority; one shared budget (500–24,000 chars) with a default 60% per-kind cap; a drop log with reasons; `serializeUnifiedContext` with boundary protection. Adapters: TP-0.45 assembly, research report, task, permission grants, creative document. Contracts gained evidence kinds `TASK_STATE`, `CREATIVE_DOCUMENT`, `PERMISSION_STATE` (additive), and `evidenceFromMemorySource` (system-derived memory is `UNTRUSTED`). |
| Files Changed | `src/intelligence/context/{ContextBoundary,UnifiedContextEngine}.ts` (new), `src/agents/ModelRouter.ts`, `src/intelligence/context/ModelContextMaterializer.ts`, `src/security/PolicyEngine.ts`, `src/contracts/{MioContracts,MioContractAdapters}.ts`, tests |
| Test Results | `npm test` **1711/1711** (5 boundary + 8 engine tests). Writing the tests surfaced a ranking flaw: a high relevance score could lift flagged content above clean content. Fixed so flagged items always sort last. |
| Security Impact | **High, positive:** closes a prompt-injection boundary-spoofing hole on the live chat path (project knowledge and memory). |
| Dependencies | 01 |
| Acceptance Gate | 03.01–03.05 **PASS** locally; PRV-03 exit gate **PARTIAL** until 03.06 wires the engine into the live path |
| Commit/PR | `36aec8d` + this commit in [#521](https://github.com/elanghaqeem-hash/mio/pull/521) |
| Remaining Gaps | 03.06 live wiring. File-intelligence and relationship-graph sources (PRV-04). The injection pattern list is heuristic: it flags and contains attacks rather than detecting all of them, and the real defense is the trust plus boundary framing. |
| Next Task | 03.06, or PRV-06 security regression freeze |

### 7.9 MIO-PRV-03.06 — Unified Context Engine on the live chat path

| Field | Detail |
|---|---|
| Milestone | MIO-PRV-03 — Unified Context Engine |
| Objective | Make the live chat path use the engine without breaking evidence grounding or the existing context formats |
| Baseline | Chat sent the TP-0.45 assembler output to the model directly |
| Implemented | `governAssembledContext()` (`UnifiedContextPipeline.ts`) runs the assembled project knowledge and memory, plus task and permission state, through `selectContext`. The existing envelopes stay the transport. Only surviving sources are sent; flagged knowledge becomes `QUARANTINED`; flagged memory becomes `SYSTEM_DERIVED`. Each kind keeps exactly its previous budget, so legitimate context that used to fit still fits. Task and permission state go to the model as a separate boundary-safe `MIO_CONTEXT` block before the user prompt. `AgentOrchestrator` uses the governed envelopes for the model request, `EvidenceGrounding`, and the source counts and lists reported to the UI (so the UI shows what the model actually received). |
| Files Changed | `src/intelligence/context/UnifiedContextPipeline.ts` (new), `src/agents/AgentOrchestrator.ts`, `src/contracts/MioContractAdapters.ts` (label fallback), `src/tests/unifiedContextPipelineTests.ts` (new) |
| Test Results | `npm test` **1716/1716**. All existing chat/context tests unchanged and green, plus 5 new tests, including an end-to-end spy on the real chat path showing the governed context and runtime-state block reach the model and the user prompt stays last. |
| Security Impact | Positive: cross-project, duplicate, and injection-flagged context is now governed on the path users actually hit |
| Dependencies | 03.01–03.05 |
| Acceptance Gate | PRV-03 exit gate **PASS** locally for the live chat path; CI via #521 |
| Commit/PR | [#521](https://github.com/elanghaqeem-hash/mio/pull/521) |
| Remaining Gaps | File-intelligence and relationship-graph context sources (PRV-04); research evidence and the active creative document are not yet passed into chat (adapters exist) |
| Next Task | MIO-PRV-06 security regression freeze |

### 7.10 PR #521 pre-merge code review

| Field | Value |
|---|---|
| Objective | Review the full #521 diff before merge, as the owner requested |
| Findings | 10 findings. All 10 fixed in `7f58161`; none deferred |
| Fixes | Paid response kept when spend persistence fails; `CloudBudget` ignores stale loads after a storage switch; context pipeline reproduces assembler budgets exactly and excludes flagged memory instead of relabelling it; chat evidence package lists only context actually sent; Workers AI TTS maps synchronous throws to 502 and cancels late streams; SFX split uses asset time, synth layers keep the patch duration, LOOP repeats to the render end, reversed buffers are cached |
| Test Results | `npm test` **1721/1721**, plus lint, both builds, release smoke, and the file-scanner benchmark. 5 new regression tests |
| Commit/PR | [#521](https://github.com/elanghaqeem-hash/mio/pull/521) |
| Next Task | Merge #521 once CI is green, then MIO-PRV-06 |

### 7.11 MIO-PRV-06 — Security regression & governance freeze

| Field | Value |
|---|---|
| Objective | Consolidate security suites into a named gate, add the missing threat cases, cover Emergency Stop, and check audit completeness |
| Baseline | `main` @ `b5ab37e`; security suites ran only inside `npm test`; no tests for the desktop SSRF filter or `WorkspaceSandbox.mutate` |
| Implemented | `npm run test:security` gate (27 suites, threat-tagged, own CI step, drift-checked by the harness integrity suite). 10 findings fixed (F-1 to F-10), including 2 HIGH: symlink write-escape from the workspace and an IPv6-embedded SSRF bypass. Details in [MIO-PRV-06-SECURITY-REGRESSION.md](./MIO-PRV-06-SECURITY-REGRESSION.md) |
| Files Changed | `electron/ipc/workspaceSandbox.ts`, `electron/ipc/browserReadSandbox.ts`, `functions/api/_security.ts` (new), `functions/api/ai/generate.ts`, `functions/api/research.ts`, `functions/api/voice/{synthesize,_session}.ts`, `src/security/{SecretRedaction,PermissionEngine,SecurityAuditLog}.ts`, `src/core/EmergencyStop.ts`, `src/agents/ModelRouter.ts`, `src/platform/desktop/DesktopBrowserGateway.ts`, `src/services/MioVoiceService.ts`, `src/services/voice/MioChatVoiceController.ts`, `src/components/layout/TopBar.tsx`, `src/types/security.ts`, tests, CI workflow, `package.json` |
| Test Results | 13 new regression tests, each failing on the pre-fix code; security gate **304/304**; the gate exits 1 with the F-1 fix reverted |
| Security Impact | Positive. Intended behavior changes: cross-origin redirects in the desktop browser now fail; a permission grant is reused only for an identical scope |
| Dependencies | PRV-01 contracts, PRV-02 router |
| Acceptance Gate | **FAIL**: open HIGH S-1 (unauthenticated `/api/ai/generate` and `/api/research`) |
| Commit/PR | New PR from `claude/mio-runtime-v1-prep-x0bpzv` |
| Remaining Gaps | S-1 (owner decision on the access model), S-2 to S-10 (assigned to later milestones) |
| Next Task | Owner decision on S-1; then PRV-05 Unified Capability Protocol |
