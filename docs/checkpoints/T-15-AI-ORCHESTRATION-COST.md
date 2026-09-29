# T-15 AI Orchestration & Cost

Status date: 2026-09-29
Status: IN PROGRESS

## Goal
Provide a provider-agnostic orchestration layer for Mio intelligence engines: capability-aware routing, privacy/locality policy, bounded fallback, explicit cost budgets, deterministic cache keys, and provenance.

## Timeline
- T-15.01#A — COMPLETE: orchestration contracts and policy.
- T-15.02#A — COMPLETE: budget/cost ledger.
- T-15.03#A — COMPLETE: deterministic cache.
- T-15.04#A — COMPLETE: fallback/circuit policy.
- T-15.05#A — COMPLETE: provenance receipts.
- T-15.06#A — COMPLETE: provider adapter boundary.
- T-15.07#A — TESTING: tests and acceptance.

## Invariants
- No API keys in source or receipts.
- Cloud processing is never implied when no provider adapter is configured.
- LOCAL_ONLY requests cannot route to remote providers.
- Budget exhaustion fails closed unless an explicit zero-cost/local route remains.
