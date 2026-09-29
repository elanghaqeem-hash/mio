# T-17 Performance & Scalability

Status date: 2026-09-29
Status: IN PROGRESS

- T-17.01#A — IN PROGRESS: baseline and performance contracts.
- T-17.02#A — PLANNED: bounded scheduling/backpressure.
- T-17.03#A — PLANNED: bounded cache/memory pressure.
- T-17.04#A — PLANNED: cancellation and large-workspace behavior.
- T-17.05#A — PLANNED: incremental processing regression.
- T-17.06#A — PLANNED: benchmark/regression gates.
- T-17.07#A — PLANNED: acceptance and merge.

Performance invariants: bounded concurrency; bounded queues/caches; deterministic result order where required; cancellation fails promptly; no optimization may weaken workspace/security boundaries.
