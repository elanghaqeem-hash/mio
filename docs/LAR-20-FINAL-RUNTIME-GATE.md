# LAR-20 — Final Runtime Integration Gate

## Verified result (2026-10-19)
For previous commit `b924e2af12614ca1c32f4bc2592652875e255af9`, 9 of 10 GitHub workflows completed with `success`; [Windows Installer Acceptance run 39227871632](https://github.com/elanghaqeem-hash/mio/actions/runs/39227871632) was still in progress when reviewed. Historical installer runs have succeeded, but this final-head release gate still requires its own completed run.

## Cancellation test hardening
`scripts/local-ai-real-cancellation-smoke.mjs` now distinguishes a deliberate client abort (`intentional-cancel`) from the 15-second watchdog (`watchdog-timeout`). A watchdog timeout is a failed acceptance check, not a successful cancellation result. The test requires real Ollama + local MIO gateway and has not been executed on the target machine.

## Release blockers
1. Apply/review/test the LAR-12 lockfile remediation patch in checked-in dependencies. CI candidate alone does not fix the deployed app.
2. Confirm all current-head CI and installer artifacts with SHA-256 values, plus distribution/signing plan.
3. Run the real-model test and intentional cancellation test on actual target hardware.
4. Verify desktop GUI settings, live chat, STOP MIO, offline use, startup/restart and uninstall manually or via recorded device acceptance.

**Release decision: NO-GO** pending these validations. Do not merge to `main` merely because mocked tests pass.
