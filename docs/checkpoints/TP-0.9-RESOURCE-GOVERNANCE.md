# TP 0.9 — Resource Governance & Execution Ledger Checkpoint

Status: IMPLEMENTED / GATE 1 PASSED / GATE 2 PENDING
Branch: `milestone/mio-web-lab-tp-0.9`
Base: `refactor/mio-web-lab-v2`
PR: #10
Gate 1 validated head: `1475733648c12e31efef60961ccfce1c6eb039c1`

## Objective

Add enforceable, observable per-task resource limits and a persistent execution ledger without weakening the MIO security/permission/sandbox control path.

## Canonical flow

```text
User Directive
  -> Intent / TaskPlanner
  -> TaskRuntime
  -> TaskScheduler
  -> security/ResourceGovernor
  -> Policy / Permission
  -> ToolRouter / ModelRouter
  -> Sandbox / Provider
  -> Result Validation
  -> TaskRuntime terminal state
  -> security/ExecutionLedger / Task Monitor
```

`security/ResourceGovernor` and `security/ExecutionLedger` are the only canonical resource governance and structured execution-history implementations. Duplicate orchestrator implementations created during development were removed before Gate 1.

## Implemented resource governance

Per-task budgets cover:
- maximum execution duration;
- tool-call count;
- network-call count;
- model-call count.

Mode-aware defaults are registered when a task first reaches the governor. Current defaults include tighter budgets for Chat/Settings/Tasks and broader budgets for Research and creative workspaces. Resource exhaustion is fail-closed: the call or scheduler dispatch is rejected before usage can exceed the configured boundary.

Network-backed tool/model accounting is atomic: if the network allowance is exhausted, neither the paired tool/model counter nor network counter advances.

Retry remains bounded by TaskRuntime retry limits. A valid in-session retry resets attempt-scoped resource usage while preserving the configured budget for the task.

## Execution ledger

`ExecutionLedger` persists up to 500 structured runtime records through the existing `StorageProvider` runtime namespace. It records task lifecycle events and resource decisions, including ALLOWED/BLOCKED outcomes and reasons. The Task Monitor exposes the latest ledger records for the selected task.

Persisted ledger data is observational metadata only. It never grants execution authority and cannot replay a task.

## Task Monitor improvements

The Task Monitor now shows:
- scheduler RUNNING / QUEUED state;
- task lifecycle and retry state;
- resource budget usage for tool/network/model calls;
- duration budget;
- exhausted-budget reason;
- task-scoped execution ledger;
- existing pause/resume/cancel/STOP MIO controls.

## Enforcement points

- `TaskScheduler` checks the resource governor before dispatch.
- `ToolRouter` applies resource preflight and atomic tool/network accounting while preserving Policy, Risk, Permission, Sandbox, validation, and audit gates.
- `ModelRouter` applies model/network resource accounting without bypassing remote-provider permission checks.
- STOP MIO and task cancellation remain stronger controls and still abort supported in-flight work.
- Resource allowance never grants permission and cannot bypass the security path.

## Validation Gate 1

GitHub Actions `MIO Validation Gate` passed on head `1475733648c12e31efef60961ccfce1c6eb039c1`.

Results:
- dependency install/audit: PASS — 0 vulnerabilities;
- lint: PASS — 0 errors, 41 existing warnings;
- TypeScript + Vite production build: PASS;
- total automated validations: **72/72 PASS**;
- original system/security audit suite: **23/23 PASS**;
- all TP 0.1–0.8 suites remain green.

New TP 0.9 validation includes:
- tool-call budget blocking;
- network-call budget blocking;
- model-call budget blocking;
- atomic network-backed tool accounting;
- duration-budget scheduler blocking;
- explicit BLOCK resource events;
- execution-ledger persistence through StorageProvider;
- retry resource reset while retaining the configured budget.

A legacy ToolRouter timeout test initially failed because independent test scenarios reused one task ID and therefore correctly shared a resource budget under the new governor. The test harness was corrected to isolate each scenario with a unique task ID; production budget enforcement was not relaxed.

## Build observation

Gate 1 output:
- initial application JS: ~284.62 kB minified / ~86.58 kB gzip;
- TaskScheduler chunk: ~3.76 kB / ~1.53 kB gzip;
- TaskMonitor chunk: ~12.29 kB / ~3.28 kB gzip;
- Studio3D remains the known large lazy chunk at ~545.07 kB and is unchanged by this milestone.

## Known boundaries

- Resource counters are attempt/session scoped; they are not replayed as executable authority after restart.
- Network accounting is capability-call based rather than byte/token/network-packet metering.
- The Execution Ledger is persistent, but it is an audit/history surface rather than a tamper-evident cryptographic log at this Technology Preview stage.
- Existing 41 lint warnings remain technical-debt baseline and were not increased by TP 0.9.
- Existing Vite config-loader and Studio3D chunk-size warnings remain non-blocking known debt.

## Definition of Done

- [x] Canonical security-layer ResourceGovernor
- [x] Per-task duration/tool/network/model budgets
- [x] Fail-closed scheduler resource gate
- [x] ToolRouter resource enforcement
- [x] ModelRouter resource enforcement
- [x] Atomic network-backed tool/model accounting
- [x] Retry resource-reset semantics
- [x] Canonical persistent ExecutionLedger
- [x] Resource observability in Task Monitor
- [x] Duplicate governance/history paths removed
- [x] Deterministic TP 0.9 tests
- [x] Gate 1: lint/build/tests pass (72/72)
- [ ] Gate 2 on this checkpoint commit
- [ ] PR ready for review
- [ ] Merge to `refactor/mio-web-lab-v2`

## Recommended next milestone

TP 0.10 should implement **Scoped Authorization & Bounded Autonomy**: task-bound permission grants, explicit scope/expiry, project/file/network/tool boundaries, dry-run requirements for high-impact plans, and audit-visible scope decisions. This continues the master principle that MIO may reason autonomously but must never act beyond explicitly authorized boundaries.
