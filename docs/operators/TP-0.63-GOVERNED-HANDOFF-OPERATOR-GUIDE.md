# TP-0.63 — Governed Training Handoff Operator Guide

TP-0.63 closes the gap between a successful TP-0.62 local training job and the existing TP-0.58 handoff/candidate-registration flow without exposing a generic shell or generic filesystem-write capability.

## Desktop operator flow

1. Open **Settings → Governed Local Training Runner**.
2. Authorize one workspace directory with the native picker.
3. Run `DRY_RUN` first for the intended TP-0.46 bundle.
4. Run `TRAIN` only after dry-run succeeds. The output directory must already exist, be empty, and sit outside the bundle directory.
5. Wait for the training job to reach `SUCCEEDED`. This state still means `TRAINED_NOT_EVALUATED`; no candidate, benchmark, promotion, or activation has occurred.
6. Review the recorded pre-training identity (`bundleId`, dataset SHA-256, config SHA-256) and the expected `mio-training-result.json` relative path.
7. Select **PACKAGE L4 TP-0.58 HANDOFF** and approve the separate scoped L4 request.
8. TP-0.63 runs only the packaged `create-training-run-handoff.mjs` packager through Electron-as-Node with `shell:false`. It does not accept an executable path, script path, arbitrary flags, arbitrary environment variables, or output filename from the renderer.
9. The output is fixed to `mio-training-handoff.json` in the training output directory. Existing files are never overwritten.
10. Mio verifies the produced handoff receipt against the immutable pre-training job identity. If the handoff points to a different bundle/dataset/config identity, the newly generated handoff is deleted and packaging fails.
11. After a valid receipt is returned, release the workspace authority unless another governed local operation still needs it.
12. Import/register the handoff through TP-0.58. Candidate state remains `EXPERIMENTAL / REGISTERED_UNEVALUATED`.
13. Continue with TP-0.50 adapter integrity, TP-0.59 handoff↔adapter binding, MioBench, release review, promotion, post-promotion integrity, and activation.

## Security properties

- Browser/Cloudflare builds fail closed; only Electron Desktop exposes this capability.
- Packaging is a separate `L4_EXECUTE` capability and is scoped to task, workspace resource, and immutable job identity.
- The renderer receives only a bounded receipt and SHA-256 identity; the handoff JSON/training JSONL is not copied into UI state.
- The fixed TP-0.58 packager is bundled as an application resource and executed using the Electron binary with `ELECTRON_RUN_AS_NODE=1` and `shell:false`.
- The operation performs no model training, model loading, benchmark, promotion, activation, upload, publication, or deployment.
- TP-0.63 proves consistency between the completed governed training job and its TP-0.58 handoff. It does not prove adapter-byte integrity or model quality; those remain later gates.

## Failure handling

Packaging is rejected when the training job is absent, not a real `TRAIN` run, not `SUCCEEDED`, lacks a result path, lacks pre-training bundle identity, no longer belongs to the authorized workspace, or a handoff already exists. A bundle/result identity mismatch also fails closed and removes the newly written handoff.

Workspace authority should not be revoked before TP-0.63 packaging completes. For running TP-0.62 jobs, revocation requests trigger cancellation first; global STOP MIO remains available as the emergency control.
