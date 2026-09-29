# T-12 Safe Mutation

Status date: 2026-09-29
Status: IN PROGRESS

## Goal
Provide an explicitly approved, auditable filesystem mutation layer for Mio Desktop while preserving workspace containment and deterministic dry-run behavior.

## Mandatory flow
Analyze → Propose → Preview → Approve → Execute

## Timeline
- T-12.01#A — COMPLETE: mutation operation/transaction contracts.
- T-12.02#A — COMPLETE: deterministic dry-run manifest.
- T-12.03#A — COMPLETE: collision/path-containment policy.
- T-12.04#A — COMPLETE: explicit approval token binding.
- T-12.05#A — COMPLETE: mkdir/rename/move/copy executor.
- T-12.06#A — COMPLETE: trash-only destructive operation boundary.
- T-12.07#A — COMPLETE: transaction preflight/partial-failure safety.
- T-12.08#A — COMPLETE: desktop capability/IPC integration.
- T-12.09#A — IN PROGRESS: tests and acceptance gate.

## Non-negotiable invariants
No execution without preview-bound explicit approval. No arbitrary absolute-path mutation. No permanent delete in T-12. Collision defaults to BLOCK. Mutation must remain inside the authorized desktop workspace.
