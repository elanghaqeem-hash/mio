# Operator Guide — TP-0.69 Candidate Attention Queue

The Candidate Attention Queue is a compact view of candidates whose existing lifecycle snapshot currently reports either `BLOCKED` or `ACTION_REQUIRED`.

## How to use it

- `BLOCKED` means an existing governed gate has reported a blocker. Read the blocker text and resolve it in the named lifecycle surface.
- `ACTION REQUIRED` means an explicit operator step is available, such as running MioBench, completing review, promotion, or activation.
- Use `GO TO CANDIDATE` to navigate/highlight the candidate in the existing governed Settings surface.
- Use the full Candidate Lifecycle Pipeline immediately below the queue when you need all ten lifecycle stages.

The queue live-refreshes from the same TP-0.68 invalidation signals as the lifecycle pipeline. Manual `REFRESH` remains available.

## What the queue is not

The ordering is not a quality score or recommendation. `BLOCKED` items are grouped first for operational visibility, then actions follow the fixed lifecycle stage order.

The queue never automatically runs a scan, benchmark, review, signer operation, promotion, activation, or runtime request. All governed actions remain explicit in their existing panels.
