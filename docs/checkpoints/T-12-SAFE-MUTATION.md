# T-12 Safe Mutation

Status date: 2026-09-29
Status: COMPLETE

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
- T-12.09#A — COMPLETE: tests and acceptance gate.

## Non-negotiable invariants
No execution without preview-bound explicit approval. No arbitrary absolute-path mutation. No permanent delete in T-12. Collision defaults to BLOCK. Mutation must remain inside the authorized desktop workspace.

## Acceptance evidence
Final implementation head `eb2a34de9dd3775bbe0a6a8368dfe7e64d65d85b` passed Mio CI, MIO Validation Gate, MIO Training Runner Contract, and Cloudflare Web Build. Safe mutation remains workspace-contained, collision-blocking, exact-preview approval-bound, OS-trash-only for destructive removal, and exposes no permanent-delete operation. Partial failure is fail-stop with an explicit receipt; automatic rollback belongs to T-13.
