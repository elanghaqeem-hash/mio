# PRV-10.06n — Verified Trusted 3D Inspection and Studio Import

## Delivered
- Trusted Node inspector derives a fixed project/task/request-scoped artifact path. No arbitrary file path from renderer. Uses bounded read (128 KiB), no-follow file open, symlink-safe directory checks and exact scene validation against the reviewed deterministic cube template.
- Electron Main read-only IPC requires a currently authorized workspace and the matching **COMMITTED** mutation checkpoint before returning the scene. STOP and revoked authority suppress success.
- Studio 3D offers an explicit **Create & Import Trusted Cube** action, invokes normal desktop workspace authorization and native consent, creates through the trusted checkpoint runtime, and only then imports an independently verified scene.
- Studio import **appends** a cube to the currently edited 3D document instead of replacing objects. Web clients cannot perform privileged creation. Existing desktop project document persistence remains responsible for retaining edits.
- Regression tests cover real generated geometry, cross-project rejection, identity tampering, geometry tampering, oversized files, symlinks, and IPC/Studio permission wiring.

## Limitations / readiness
- The trusted scene is a fixed 8-vertex, 6-face cube template, not generative 3D modelling.
- Studio frontend project identity and the desktop authorized workspace are separate concepts; the private artifact is keyed by authorized workspace. No general asset browser or reverse lookup is exposed.
- The trusted checkpoint archive is not authenticated against a privileged local attacker with filesystem write permission. Strict deterministic scene matching rejects altered geometry but cannot prove ownership independently of the OS user-data trust boundary.
- STOP between a filesystem effect and durable COMMITTED checkpoint can leave an artifact requiring manual reconciliation. No automatic replay or rollback.
- Tests do not replace real GUI and OS crash/power-loss fault injection. No production deployment.

## Next
Extend verified read-only artifact discovery and a user-facing recovery inspector; run end-to-end MiloBench/OS kill tests before broader creative templates and production release.
