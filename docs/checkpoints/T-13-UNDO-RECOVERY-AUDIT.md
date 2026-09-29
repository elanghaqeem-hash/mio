# T-13 Undo / Recovery / Audit

Status date: 2026-09-29
Status: COMPLETE

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
- T-13.08#A — COMPLETE: tests and acceptance gate.

## Safety boundary
Undo is itself a mutation and must use T-12 preview → approval → execution. T-13 must never silently overwrite a changed target. TRASH recovery is not advertised as automatic until an OS-supported restoration path is proven.

## Acceptance evidence
Implementation head `1f12febb4644f753195b60d76239d2ea47416dba` passed Mio CI, MIO Validation Gate, MIO Training Runner Contract, and Cloudflare Web Build. Journal persistence is privileged, append-only JSONL with a SHA-256 hash chain. Undo for rename/move is a conservative inverse plan that must re-enter T-12 preview and explicit approval. COPY/MKDIR/TRASH are not falsely advertised as automatic undo operations.
