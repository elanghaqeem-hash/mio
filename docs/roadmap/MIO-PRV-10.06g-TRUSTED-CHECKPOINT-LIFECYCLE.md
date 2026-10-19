# MIO PRV-10.06g — Trusted Node Checkpoint Lifecycle Safety

This stage hardens the opt-in Node checkpoint owner created in PR #535. It does **not** expose an arbitrary capability execution IPC channel or enable browser/renderer filesystem access.

## Changes
- The exclusive Node runtime now exposes `stop()` to latch admission shut while permitting already admitted operations to finish checkpoint settlement.
- The public `gate` tracks in-flight mutations starting **before** the durable PREPARED write, so `close()` refuses to release a writer lock while a call is pending.
- Successful `complete()` removes the active record. Failed checkpoint writes mark the owner compromised and prevent subsequent admissions or orderly release without manual review. This deliberately leaves the lock in place for investigation.
- `close()` denies shutdown while pending work or compromised status exists; existing inode identity validation for the lock is retained.
- Regression tests cover STOP/admission, active lock drain, and ordinary committed/uncertain settlement.

## Limits and next milestone
This is a single-process lifecycle safety layer, **not** cross-engine runtime activation. No engine call has been redirected through Electron Main. No automatic retry, recovery resolution, or stale-lock takeover. A runtime integration must own its own shutdown/STOP propagation, policy and permission checks, task cancellation, and explicit capability dispatch before activation. Crash and power-loss fault injection on target operating systems remain required.

No production deployment.
