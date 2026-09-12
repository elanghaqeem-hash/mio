# MIO Web Lab — TP 0.7 Checkpoint

## Milestone
**Task Runtime, Observability & Cancellation Control**

TP 0.7 converts MIO task planning from transient plan text into an observable runtime lifecycle. This milestone remains on the Web Lab integration track and does not modify `main`.

## Architecture

```text
User Directive
  -> Intent Analyzer
  -> Task Planner
  -> Task Runtime
      -> lifecycle / progress / dependency / retry state
      -> permission waiting state
      -> task-scoped cancellation handlers
  -> Tool Router or Model Router
  -> Permission Engine
  -> Sandbox / Provider
  -> Result Validation
  -> Task Runtime terminal state
  -> Task Monitor
```

The task runtime does not replace the Security/Permission/Tool Router architecture. It observes and controls execution lifecycle around those existing gates.

## Runtime Lifecycle

Supported task states:

- `PENDING`
- `RUNNING`
- `WAITING_PERMISSION`
- `PAUSED`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

Supported step states:

- `PENDING`
- `RUNNING`
- `COMPLETED`
- `FAILED`
- `SKIPPED`
- `CANCELLED`

Each runtime task records identity, prompt/title, project and mode context, progress, steps, timestamps, retry budget, dependencies, error state, and cancellation reason.

## Task Monitor

A new lazy-loaded **Task Monitor** workspace exposes live runtime snapshots with:

- concurrent task list;
- runtime status and progress;
- step-level execution state;
- permission-wait visibility;
- cooperative pause/resume;
- bounded retry scheduling;
- task cancellation;
- STOP MIO;
- dependencies and update timestamps.

The UI deliberately avoids claiming capabilities beyond the current runtime implementation:

- **Pause** is a cooperative lifecycle pause at supported step boundaries; it does not freeze an arbitrary network/model operation already inside a provider call.
- **Cancel / STOP MIO** is the mechanism that aborts supported in-flight operations through task-scoped `AbortSignal` propagation.
- **Schedule retry** returns a failed task to `PENDING` within its retry budget. Automatic queue-worker re-execution is not claimed in TP 0.7 and is deferred to the scheduler/queue milestone.

## Cancellation Propagation

Task cancellation is now operational rather than cosmetic.

- `TaskRuntime` owns task-scoped cancellation handlers.
- `ToolRouter` registers an `AbortController` per tool execution.
- Research provider contracts accept `AbortSignal`.
- Wikipedia and Crossref fetches receive that signal.
- `ResearchEngine` rejects post-cancellation completion.
- `ModelRouter` registers task-scoped abort handlers for model/provider execution.
- Model fallback is not accepted after task cancellation.
- `STOP MIO` cancels every non-terminal runtime task and invokes registered cancellation handlers.
- Agent responses do not promote a late result after the runtime task has entered `CANCELLED`.

## Permission State Synchronization

Permission state is no longer inferred only from UI state.

- L4/L5 ToolRouter execution moves the associated runtime task to `WAITING_PERMISSION`.
- Approved tool execution returns the task to `RUNNING`.
- Remote model execution performs the same runtime transition around the L4 model permission gate.
- Sensitive top-level requests remain protected by the existing L5 human-in-the-loop gate.

## Dependency and Retry Primitives

TP 0.7 adds the runtime primitives required for later queue scheduling:

- dependency registration;
- dependency-completion check;
- retry counter;
- maximum retry budget;
- retry transition from `FAILED` to `PENDING`;
- fail-closed retry behavior while STOP MIO is active.

Automatic dependency-driven scheduling and persisted queue rehydration are intentionally deferred rather than simulated.

## Validation Harness Improvement

TP 0.7 exposed a shared-singleton test-isolation issue: TaskRuntime STOP MIO tests initially ran concurrently with conversation-context tests because the validation suites used `Promise.all`.

The harness was corrected to run stateful suites serially. This prevents EmergencyStop, ModelRouter, TaskRuntime, and other singleton state from leaking across concurrent tests and makes the CI result deterministic.

## Verified Gate

Latest verified pre-checkpoint gate:

- dependency audit: **0 vulnerabilities**;
- lint: **0 errors / 41 warnings**;
- TypeScript + Vite production build: **PASS**;
- total validation: **52 / 52 PASS**;
- initial application JS: **276.14 kB** (gzip **84.66 kB**);
- Task Monitor lazy chunk: **7.77 kB** (gzip **2.19 kB**);
- Studio3D remains isolated as an on-demand chunk (~545 kB), preserving TP 0.6 code splitting.

The 41 lint warnings are the pre-existing TP 0.6 baseline; TP 0.7 introduces no net lint-warning regression after cleanup.

## Tests Added

TaskRuntime deterministic tests verify:

1. step progress calculation;
2. pause of a running task;
3. resume when STOP MIO is inactive;
4. invocation of registered cancellation handlers;
5. dependency registration;
6. dependency blocking;
7. dependency release after completion;
8. retry within configured budget;
9. rejection beyond retry budget;
10. STOP MIO cancellation of every active runtime task.

Existing system, security, research, tool, model, AI proxy, persistence, memory, creative validation, and conversation-continuity tests remain green.

## Remaining Work / Next Milestone

Recommended TP 0.8: **Persistent Task Queue & Scheduler**.

It should add:

- queue worker with explicit concurrency limits;
- persisted runtime/task history through the StorageProvider;
- queue rehydration after reload;
- automatic execution of scheduled retries;
- dependency-aware dispatch;
- cooperative pause enforcement between execution steps;
- per-task resource/time/retry budgets;
- event history and runtime audit persistence;
- safe recovery semantics for tasks interrupted by browser/app restart.

This keeps the progression aligned with the MIO master architecture: Task Planner -> Task Queue -> Dependency Manager -> Progress Manager -> Cancellation Manager -> Result Aggregator, while retaining Security -> Permission -> Sandbox -> Validation -> Audit as the mandatory execution boundary.
