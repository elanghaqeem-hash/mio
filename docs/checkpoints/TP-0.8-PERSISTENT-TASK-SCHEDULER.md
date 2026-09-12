# TP 0.8 — Persistent Task Queue & Scheduler Checkpoint

Status: IMPLEMENTED / FIRST GATE PASSED
Branch: `milestone/mio-web-lab-tp-0.8`
Base: `refactor/mio-web-lab-v2`
PR: #9

## Objective

Turn the TP 0.7 observable task runtime into a durable, dependency-aware execution queue while preserving the MIO control principle that no execution may silently resume beyond the user's authorized context.

## Implemented Architecture

```text
User Directive
  -> Intent / Task Planner
  -> TaskRuntime (persistent metadata + lifecycle)
  -> TaskScheduler (queue + dependency gate + concurrency limit)
  -> Security / Permission
  -> ToolRouter / ModelRouter
  -> Sandbox / Provider
  -> Validation
  -> TaskRuntime terminal state
  -> Persistent history / Task Monitor
```

## Implemented Capabilities

- Task runtime snapshots persist through the existing `StorageProvider` abstraction in the `runtime` namespace.
- Web runtime uses the existing IndexedDB-backed storage provider; non-browser/test environments retain the existing in-memory fallback.
- Active/non-terminal tasks recovered after restart are converted to `FAILED` with an explicit interruption reason instead of being silently resumed.
- Interrupted running steps are also marked `FAILED` for traceability.
- `TaskScheduler` enforces a bounded concurrency limit (default: 2).
- Scheduler dispatch is dependency-aware; tasks wait until all declared prerequisite tasks are `COMPLETED`.
- Agent execution is routed through the scheduler before privileged tool/model execution.
- Queued tasks are cancelled when STOP MIO is activated.
- In-flight cancellation remains task-scoped through TP 0.7 AbortSignal propagation.
- Scheduler keeps executable runners only in memory for the current application session, enabling real queue-based retry after eligible failures.
- Executable closures are deliberately not serialized to storage.
- After application restart, a historical failed task without a live runner cannot claim executable retry; the user must re-submit the directive and re-enter authorization flow.
- Cooperative pause is enforced at supported step boundaries: an in-flight provider call may finish, but the next step does not advance until explicit Resume.
- Cancel / STOP MIO remains the immediate abort mechanism for supported in-flight network/model operations.
- Task Monitor exposes runtime lifecycle plus scheduler RUNNING slots, QUEUED count, concurrency limit, and in-session retry availability.

## Safety / Control Boundaries

1. Persisted data is metadata/history, not executable authority.
2. MIO never automatically replays an interrupted task after restart.
3. Retry remains bounded by `maxRetries`.
4. Retry after restart is unavailable unless a new directive recreates an authorized runner.
5. Dependencies gate dispatch but do not grant permissions.
6. Scheduler does not bypass PolicyEngine, PermissionEngine, ToolRouter, Sandbox, Result Validation, or STOP MIO.
7. Pause is cooperative at execution boundaries; it is not represented as an OS-level freeze of a running HTTP/model request.
8. Cancel / STOP is the mechanism used to abort supported in-flight operations.

## Validation Gate 1

GitHub Actions `MIO Validation Gate` passed after two corrections discovered by CI:

- Fixed heterogeneous queue generic variance in `TaskScheduler` without weakening public generic return types.
- Restored TP 0.7 resume semantics (`PAUSED -> RUNNING`) so an already-dispatched task keeps its execution slot while cooperative boundary waiting remains enforced.

Validated results:

- Dependency install / audit: PASS, 0 vulnerabilities
- Lint: PASS, 0 errors, 41 existing warnings
- TypeScript + Vite production build: PASS
- Total automated validations: **64/64 PASS**
- Existing TP 0.7 and prior security/model/research/tool tests remain green
- New persistence/scheduler/recovery validations include:
  - runtime history persistence
  - fail-safe interrupted-task recovery
  - interrupted-step recovery
  - concurrency enforcement
  - queued dispatch after slot release
  - dependency blocking / release
  - in-session retry runner retention
  - real retry re-execution through queue
  - cooperative paused-state preservation
  - blocked progression while paused
  - progression after explicit resume

## Build Observation

At Gate 1:

- Initial application JS: approximately 277.64 kB (gzip ~85.02 kB)
- `TaskScheduler` lazy/output chunk: approximately 3.50 kB (gzip ~1.44 kB)
- Existing Studio3D chunk remains the known large bundle (~545 kB) and is not introduced by TP 0.8.

## Known Non-Blocking Technical Debt

- 41 lint warnings pre-exist the milestone and remain at baseline; TP 0.8 does not increase them.
- Vite reports the existing CommonJS/ESM config-loader warning.
- Studio3D remains above the 500 kB chunk warning threshold.
- Persistent executable job definitions are intentionally not implemented in TP 0.8; only runtime metadata/history is persisted.
- Cross-session automatic replay is intentionally prohibited at this milestone.

## Definition of Done for TP 0.8

- [x] Persistent TaskRuntime state
- [x] Safe interrupted-task recovery
- [x] Dependency-aware scheduler
- [x] Concurrency limit
- [x] Agent routed through scheduler
- [x] STOP MIO queued-task cancellation
- [x] In-session executable retry
- [x] Cooperative pause boundary
- [x] Scheduler observability in Task Monitor
- [x] New deterministic tests
- [x] Gate 1: lint/build/tests pass
- [ ] Gate 2 on checkpoint commit
- [ ] PR ready for review
- [ ] Merge to `refactor/mio-web-lab-v2`

## Next Architecture Direction

After TP 0.8 is merged, the next milestone should focus on **Resource Governance & Execution History** rather than expanding autonomy. Recommended scope: task resource budgets, per-task timeout/budget metadata, structured execution/audit history, bounded network/tool usage, scheduler fairness/priority, and user-visible resource controls. This continues the master principle: MIO may reason autonomously, but execution remains bounded, observable, recoverable, and user-controlled.
