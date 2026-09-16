# TP-0.64 — Governed Desktop Handoff Ingestion

## Objective

Close the usability gap between TP-0.63 packaging and TP-0.58 candidate registration without introducing a generic filesystem browser/read surface in Settings.

## Flow

1. TP-0.62 completes a governed `TRAIN` job.
2. TP-0.63 creates the fixed `mio-training-handoff.json` and stores a bounded receipt.
3. TP-0.64 discovers the latest successful TP-0.63 receipt from the current desktop session.
4. The operator explicitly authorizes the workspace root again through the native directory picker.
5. Electron reads only `receipt.handoffRelativePath`; the renderer cannot provide another path.
6. Electron validates job/receipt identity, file type, size, schema/kind and bundle/dataset/config/handoff identities before returning the handoff JSON.
7. The renderer routes the transient handoff JSON through the existing TP-0.58 verifier.
8. Runtime alias and artifact URI remain explicit operator-confirmed values.
9. Candidate registration remains a separate explicit action and ends at `EXPERIMENTAL / REGISTERED_UNEVALUATED`.
10. After successful registration, TP-0.64 clears its transient handoff JSON and revokes the temporary workspace authority best-effort.

## Capability boundary

`service.desktop.training.read-handoff`

- runtime: Electron Desktop only
- mode: `SETTINGS`
- risk: `HIGH`
- permission: `L0_OBSERVE`
- network access: false
- scope: task + authorized workspace resource + immutable job/path/hash identity
- no arbitrary handoff path input from the UI
- no write, shell, process launch, upload, benchmark, promotion or activation authority

L0 is used because the operation is read-only and follows an explicit native workspace authorization. The capability remains HIGH risk metadata-wise because the handoff contains the governed training JSONL; it is therefore bounded to 64 MiB, a fixed receipt path, a regular non-symlink file, and the existing TP-0.58 verification contract.

## Fail-closed checks

The read is rejected if:

- no TP-0.63 receipt exists;
- the TP-0.62 job is missing or is not a successful `TRAIN` job;
- receipt identity differs from the frozen job identity;
- the newly authorized workspace does not contain the fixed receipt path;
- the path resolves to a symlink/non-file;
- the file is empty, exceeds 64 MiB, contains null-delimited content, or is invalid JSON;
- schema/kind, handoff SHA, bundle ID, dataset SHA or config SHA differ from the TP-0.63 receipt;
- the renderer capability scope does not match workspace/job/path/hash;
- the TP-0.58 verifier rejects the handoff.

## Privacy and lifecycle

The full handoff is returned to the renderer only transiently for TP-0.58 verification/registration. TP-0.64 does not persist the training JSONL as a new UI artifact. After registration the panel clears the transient JSON and attempts to revoke the re-authorized workspace.

TP-0.64 never implies model quality or release readiness. TP-0.50 adapter integrity, TP-0.59 binding, MioBench, release review, promotion, post-promotion integrity and activation remain mandatory independent gates.
