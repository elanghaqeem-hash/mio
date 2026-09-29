# T-13 Undo / Recovery / Audit

Status date: 2026-09-29
Status: IN PROGRESS

## Goal
Make approved T-12 mutations traceable and recoverable through deterministic journaling, inverse planning, failure recovery guidance, and bounded audit history.

## Timeline
- T-13.01#A — COMPLETE: transaction journal/event contracts.
- T-13.02#A — COMPLETE: before/after operation evidence.
- T-13.03#A — COMPLETE: inverse plan for mkdir/rename/move/copy.
- T-13.04#A — COMPLETE: trash recovery boundary.
- T-13.05#A — COMPLETE: partial-transaction recovery plan.
- T-13.06#A — COMPLETE: append-only audit store.
- T-13.07#A — COMPLETE: Electron integration.
- T-13.08#A — IN PROGRESS: tests and acceptance gate.

## Safety boundary
Undo is itself a mutation and must use T-12 preview → approval → execution. T-13 must never silently overwrite a changed target. TRASH recovery is not advertised as automatic until an OS-supported restoration path is proven.
