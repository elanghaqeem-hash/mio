# MIO PRV-10.06m — Electron Main Trusted 3D Cube Activation

## Implemented
- A narrow `mio:creative:createTrustedCube` IPC invokes trusted Electron Main code through the existing main-frame-only `secureHandle` wrapper and typed preload.
- Accepts exactly six command fields; only mode `3D` and template `primitive_cube_v1`. Project identity must be the ID of a workspace explicitly authorized in the current session.
- Every creation requires a native Electron confirmation dialog. Cancel is the default and the authorization/STOP latch is checked again after dialog completion. No renderer-supplied permissions, filesystem paths or JavaScript executors are trusted.
- An exclusive Node checkpoint runtime plus actual cube mesh adapter persists a validated `.mio3d.json` asset in trusted application data. Duplicate requests fail closed; no automatic retry or rollback.
- Emergency STOP, workspace revocation, window closing, and application exit consider active creative jobs. An operation already doing filesystem writes may finish, then returns a review-required result.
- Regression tests verify the IPC and consent wiring; existing tests verify actual kernel cube generation, durable disk artifact, STOP and checkpoint protection.

## Known limits
- The user-facing Studio 3D and ProjectManager do not yet auto-import the artifact; it lives in application-private data under an opaque workspace key. There is no general scene browsing or authorized importer in this stage.
- This authorizes a *specific* deterministic scene template and single explicit desktop user consent; it does not grant arbitrary Creative Engine, model, voice or source filesystem mutation permissions.
- Failed checkpoint commit can leave a scene artifact and lock requiring manual review. No independent OS power-loss or real GUI test yet.
- UI permission context is tied to the currently authorized workspace session. The source project's frontend semantic identity is not automatically mapped to this workspace ID.
- The native confirmation remains required per invocation. No production deployment in this PR.

## Next
Add a read-only authorized artifact verification/inspection endpoint with byte bounds, asset identity checks, topology checks and recovery status. Then integrate explicit import into Studio 3D after end-to-end and process-kill testing.
