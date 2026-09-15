# Phase 0 / TP 0.1 Checkpoint

Branch: `refactor/mio-web-lab-v2`

## Objective

Create the first reusable Web Lab foundation without changing `main` and without mass-moving existing modules.

## Completed

- Created cross-platform runtime contract.
- Added browser/Web Lab runtime adapter.
- Extracted intent analysis from `AgentOrchestrator`.
- Added reusable task-planning contract.
- Routed `AgentOrchestrator` through Intelligence -> Orchestrator separation.
- Added `WAITING_PERMISSION`, `EXECUTING`, and `CREATING` Mio Core states.
- Preserved existing modes, project prototype, security classes, and creative studios.
- Documented Web Lab architecture and next checkpoints.

## Deliberately deferred

- No changes to `main`.
- No mass folder migration.
- No provider/API credential changes.
- No native filesystem expansion.
- No SQLite migration yet.
- No real web research provider yet.
- No destructive actions.

## Validation note

Repository-level diff has been reviewed against `main`. The branch is isolated and ahead of `main` only. Runtime build/test execution should be performed by CI or a development environment with repository/network access before merge.

## Next milestone

TP 0.2: project persistence and controlled memory using a storage-provider abstraction, with IndexedDB as the Web Lab implementation and SQLite reserved for the desktop adapter.
