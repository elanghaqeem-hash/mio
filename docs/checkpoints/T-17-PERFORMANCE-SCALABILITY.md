# T-17 Performance & Scalability

Status date: 2026-09-29
Status: IN PROGRESS

- T-17.01#A — COMPLETE: baseline and performance contracts.
- T-17.02#A — COMPLETE: bounded scheduling/backpressure.
- T-17.03#A — COMPLETE: bounded cache/memory pressure.
- T-17.04#A — COMPLETE: cancellation and large-workspace behavior.
- T-17.05#A — COMPLETE: incremental processing regression.
- T-17.06#A — TESTING: benchmark/regression gates.
- T-17.07#A — PLANNED: acceptance and merge.

Performance invariants: bounded concurrency; bounded queues/caches; deterministic result order where required; cancellation fails promptly; no optimization may weaken workspace/security boundaries.
