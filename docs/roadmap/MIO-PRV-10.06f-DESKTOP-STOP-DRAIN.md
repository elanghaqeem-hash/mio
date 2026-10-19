# MIO PRV-10.06f — Desktop STOP and mutation drain

## Implemented
- Emergency STOP in Electron main latches desktop file mutations for the remainder of this desktop process and clears previously issued approval tokens. Tray STOP also triggers the same latch.
- Mutation approval refuses requests after STOP, including those whose approval dialog had already opened before STOP. Execution refuses requests after STOP, before consuming tokens or writing checkpoints.
- A running file operation cannot reliably be interrupted midway. After it completes, its durable checkpoint is committed; before the next operation the STOP latch is checked. Remaining operations are skipped with `STOPPED_PARTIAL`, completed operation IDs and a FAILED journal marker. PREPARED checkpoints are retained for human review.
- Window close and quit are refused while a workspace mutation is active. `before-quit` requests STOP and prevents exit until the in-flight mutation handler releases its lease. A subsequent explicit quit may occur after drain.
- Renderer cannot initiate STOP reset. No automatic replay is permitted.

## Known limitations
- The in-flight filesystem mutation is *not* preemptively cancelled. STOP is a between-operations barrier; multi-operation transactional rollback is not supported.
- Startup after hard process kill still requires manual inspection of UNCERTAIN checkpoints. The archive remains unsigned and has no cross-process CAS.
- Only Electron desktop file mutations are gated. Other creative engine and capability protocol calls require separate main-process dispatch and STOP integration.
- Tests include handler contract assertions, not real power-loss or GUI automation. No production deployment.
