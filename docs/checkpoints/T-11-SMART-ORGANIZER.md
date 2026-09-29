# T-11 Smart Organizer

Status date: 2026-09-29
Status: IN PROGRESS

## Goal
Turn file intelligence, search, and relationship evidence into deterministic, previewable organization recommendations without mutating the filesystem.

## Timeline
- T-11.01#A — IN PROGRESS: organization rule/action/manifest contracts.
- T-11.02#A — PLANNED: category/folder recommendations.
- T-11.03#A — PLANNED: rename/move recommendations.
- T-11.04#A — PLANNED: duplicate handling recommendations.
- T-11.05#A — PLANNED: project/client grouping.
- T-11.06#A — PLANNED: natural-language organization-plan contract.
- T-11.07#A — PLANNED: deterministic preview manifest/conflict reporting.
- T-11.08#A — PLANNED: acceptance gate.

## Safety boundary
T-11 is recommendation-only. It MUST NOT create, rename, move, copy, trash, or delete filesystem objects. All mutations require T-12 Safe Mutation approval/execution.
