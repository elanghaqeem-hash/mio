# MIO PRV-11.01 — MioBench Real Node-Process Crash & Recovery Gate

## Purpose
Verify the trusted 3D cube runtime through separate Node processes, including actual artifact writes and intentional abrupt process exits. This is the first PRV-11 integration gate, **not** final desktop release readiness.

## Test scenarios
1. Consent declined: no scene, no checkpoint, graceful release of lock.
2. Consent approved: real deterministic cube persisted, durable checkpoint COMMITTED, scene matches the reviewed geometry, and same request cannot be replayed after restart.
3. Process exits with code 73 after durable EXECUTING but before any asset write: on restart persisted EXECUTING is conservatively classified UNCERTAIN, no asset exists and stale single-writer lock prevents silent takeover.
4. Process exits with code 74 after the actual .mio3d.json fsynced write but before COMMITTED checkpoint: asset exists, recovered status is UNCERTAIN rather than a false success, and the same request is denied even if a human explicitly removes the stale lock.

Tests run in disposable OS temp roots with `node --import tsx` and the real trusted adapter/checkpoint persistence. The parent test never uses the application user-data root. Intentional exit is a process-kill simulation: it does **not** prove power-loss durability, Windows process termination correctness, interactive Electron IPC dialogs or renderer Studio import. A real OS test matrix and GUI automation remain required.

## Acceptance
All four project CI workflows succeed on branch head. No automatic stale-lock reclamation or retry. No production deployment.
