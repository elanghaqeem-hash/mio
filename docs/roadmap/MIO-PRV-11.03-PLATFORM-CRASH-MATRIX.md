# MIO PRV-11.03 — Cross-platform process-crash acceptance matrix

A required GitHub Actions matrix now executes the four real trusted 3D cube subprocess scenarios using repository-locked Node dependencies on **ubuntu-latest, macos-latest and windows-latest**. It must show four PASS results on each platform; no platform is configured with `continue-on-error`, and no skip counts as passing.

Scenarios: consent denial with zero effects, committed asset/checkpoint survival, abrupt process exit immediately before a file effect, and abrupt process exit immediately after an effect but before commit. The harness checks restart classification, stale single-writer lock, asset integrity, and no automatic replay after an operator-only test-root lock removal.

This gate tests actual Node processes in disposable temporary directories. It does **not** perform literal power loss, native Electron GUI on macOS/Windows, or hardware-level flush guarantees. Directory fsync and exclusive writer behavior may differ between operating systems: any unsupported operation must fail closed and must be tracked as a release blocker rather than silently skipped.

If a platform fails, keep the PR open, diagnose its exact failure, and avoid claiming cross-platform recovery readiness or publishing a production release.
