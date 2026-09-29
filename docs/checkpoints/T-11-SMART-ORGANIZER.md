# T-11 Smart Organizer

Status date: 2026-09-29
Status: COMPLETE

## Goal
Turn file intelligence, search, and relationship evidence into deterministic, previewable organization recommendations without mutating the filesystem.

## Timeline
- T-11.01#A — COMPLETE: recommendation-only action/manifest contracts enforce approval and prohibit execution.
- T-11.02#A — COMPLETE: metadata-grounded category/folder recommendations.
- T-11.03#A — COMPLETE: sanitized rename/move recommendations with no mutation path.
- T-11.04#A — COMPLETE: exact hash duplicates produce review recommendations only.
- T-11.05#A — COMPLETE: semantic project/client grouping recommendations.
- T-11.06#A — COMPLETE (contract): rules/local/external planner provenance with explicit non-execution.
- T-11.07#A — COMPLETE: deterministic preview detects multiple rename/move and rename target collisions.
- T-11.08#A — COMPLETE: final implementation head passed Mio CI, MIO Validation Gate, MIO Training Runner Contract, and Cloudflare Web Build.

## Safety boundary
T-11 is recommendation-only. It MUST NOT create, rename, move, copy, trash, or delete filesystem objects. All mutations require T-12 Safe Mutation approval/execution.

## Acceptance evidence
Final implementation head `a754fe842cb458c69f723edb8cd5cf1f831dcc30` passed all four repository workflows. Acceptance covers recommendation-only manifests, category/group/rename/move/duplicate-review recommendations, natural-language plan contracts, and deterministic conflict preview. T-11 exposes no filesystem mutation execution path.
