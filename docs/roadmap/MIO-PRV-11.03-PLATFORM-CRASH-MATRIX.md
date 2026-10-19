# MIO PRV-11.03 — Native Platform Recovery / Fail-Closed Acceptance

## Verified findings

Linux and macOS GitHub Actions runners passed all four **real separate-process** trusted 3D scenarios: declined consent, successful durable scene/checkpoint, crash before asset effect, and crash after asset write but before checkpoint commit.

**Windows currently cannot pass this recovery suite.** Native Windows failed during creation of the exclusive writer checkpoint lock with `EPERM: operation not permitted, fsync` when attempting Node directory fsync. Silently dropping directory durability would weaken the checkpoint safety contract and is prohibited.

As a bounded safety repair, trusted Node checkpoint activation on `win32` now explicitly returns `CHECKPOINT_DURABILITY_UNSUPPORTED_WINDOWS` **before** creating a writer lock or starting any effect. The Windows runner is a REQUIRED **fail-closed negative-path** test ensuring creation is rejected and no checkpoint lock or 3D asset is left behind. This green safety test must NOT be interpreted as Windows crash/restart recovery passing.

| OS runner | Test acceptance | Current coverage |
| --- | --- | --- |
| ubuntu-latest | Four subprocess crash/restart tests | Full suite on runner |
| macos-latest | Four subprocess crash/restart tests | Full suite on runner |
| windows-latest | Explicit unsupported-backend denial, no lock/effect | Windows creative runtime **disabled**; crash/restart NOT verified |

The platform test script prints either `MIO CROSS-PLATFORM CRASH GATE: PASS` (Linux/macOS four tests) or `MIO WINDOWS SAFETY GATE: PASS` (Windows refusal only). No job uses `continue-on-error` and no OS is omitted.

## Production blockers

1. Implement a reviewed Windows-specific durable checkpoint backend with explicit atomic replacement, publication persistence and writer coordination. Do NOT waive durability or silently auto-reclaim crash locks.
2. Repeat the four real subprocess scenarios on Windows after backend activation.
3. GUI tests with actual native dialogs and Studio3D WebGL rendering on target platforms remain outstanding.
4. Physical power loss and filesystem integrity across OS/hardware are NOT verified. No production deployment.

This PR is a platform safety increment, not PRV-11.03 Windows recovery completion.
