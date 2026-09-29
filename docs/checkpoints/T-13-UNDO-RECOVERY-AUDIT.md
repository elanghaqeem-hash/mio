# T-13 Undo / Recovery / Audit

Status date: 2026-09-29
Status: IN PROGRESS

## Goal
Make approved T-12 mutations traceable and recoverable through deterministic journaling, inverse planning, failure recovery guidance, and bounded audit history.

## Timeline
- T-13.01#A — IN PROGRESS: transaction journal/event contracts.
- T-13.02#A — PLANNED: before/after operation evidence.
- T-13.03#A — PLANNED: inverse plan for mkdir/rename/move/copy.
- T-13.04#A — PLANNED: trash recovery boundary.
- T-13.05#A — PLANNED: partial-transaction recovery plan.
- T-13.06#A — PLANNED: append-only audit store.
- T-13.07#A — PLANNED: Electron integration.
- T-13.08#A — PLANNED: tests and acceptance gate.

## Safety boundary
Undo is itself a mutation and must use T-12 preview → approval → execution. T-13 must never silently overwrite a changed target. TRASH recovery is not advertised as automatic until an OS-supported restoration path is proven.
