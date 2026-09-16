# TP-0.63 — Governed TP-0.58 Handoff Packaging

## Status

Implementation checkpoint that connects a successful TP-0.62 desktop `TRAIN` job to the existing TP-0.58 portable training-run handoff without introducing generic filesystem write or shell authority.

## Objective

After TP-0.62 completes real training, the operator can explicitly package the exact job-bound bundle and result into the existing TP-0.58 handoff:

```text
TP-0.62 successful TRAIN job
  -> retained pre-training bundle identity
  -> explicit PACKAGE L4 TP-0.58 HANDOFF
  -> CapabilityRegistry
  -> SecureServiceGateway
  -> scoped PermissionEngine approval
  -> trusted preload IPC
  -> TrainingHandoffPackager
  -> fixed create-training-run-handoff.mjs
  -> mio-training-handoff.json
  -> bounded receipt only returned to renderer
  -> explicit TP-0.58 candidate import still required
```

## Why this checkpoint exists

TP-0.62 previously produced `mio-training-result.json`, while TP-0.58 packaging remained a separate CLI step. TP-0.63 removes that operational friction while retaining the same verifier/packager contract.

It does **not** create a second handoff implementation. The desktop process invokes the already-tested:

`scripts/training/create-training-run-handoff.mjs`

## Pre-training identity capture

TP-0.62 job snapshots now retain the declared bundle identity before the training child process is launched:

- `bundleId`
- `datasetSha256`
- `configSha256`

The identity is captured from the bounded regular `manifest.json` inside the authorized bundle directory.

This provides a stable reference for TP-0.63. Even if the workspace files are later modified, a generated handoff is rejected and removed unless its bundle/fingerprint identity still matches the job that actually initiated training.

The Python runner remains responsible for complete TP-0.46 verification. Identity capture is an additional binding layer, not a replacement for bundle verification.

## Capability contract

Capability:

`service.desktop.training.package-handoff`

Properties:

- kind: `SERVICE`
- mode: `SETTINGS`
- risk: `HIGH`
- permission: `L4_EXECUTE`
- network access: `false`
- availability: desktop training bridge only
- scope fields: `TASK + RESOURCE + PATH`
- timeout: 65 seconds

The authorization scope binds:

- training job ID;
- workspace ID;
- bundle relative path;
- fixed training-result relative path;
- fixed handoff relative path.

A scope mismatch is rejected before permission/IPC execution.

## Eligible jobs

TP-0.63 accepts only a TP-0.62 job where:

- `mode === TRAIN`;
- `state === SUCCEEDED`;
- the fixed `resultFileRelativePath` exists;
- request workspace/path fields exactly match the immutable job snapshot.

Dry-run, running, failed, or cancelled jobs cannot be packaged.

## Output boundary

The renderer cannot choose an arbitrary output filename.

For a result such as:

`adapter-output/mio-training-result.json`

TP-0.63 derives exactly:

`adapter-output/mio-training-handoff.json`

The handoff is therefore created beside the successful runner result. Existing handoff files are never overwritten.

No generic `writeFile`, arbitrary bytes, or arbitrary destination IPC is exposed to the renderer.

## Fixed packager runtime

The desktop build packages the existing TP-0.58 utility as an Electron `extraResource`:

`scripts/training/create-training-run-handoff.mjs`

The main process resolves this exact regular file under a trusted application resource root and rejects symlink/escape conditions.

The utility is launched with:

- `process.execPath`;
- `ELECTRON_RUN_AS_NODE=1`;
- `shell: false`;
- fixed script path;
- fixed argument names;
- canonical bundle/result paths derived from workspace authority;
- fixed handoff destination derived from the result location.

No separate system Node installation is required by the packaged Electron path.

## Post-package verification

The existing TP-0.58 packager already re-verifies:

- training bundle schema;
- dataset SHA-256;
- config SHA-256;
- bundle ID;
- training example identity/order;
- result schema/state;
- result-to-bundle identity;
- training result SHA-256;
- deterministic handoff SHA-256.

TP-0.63 adds a second post-write binding check in Electron main process.

The generated handoff must match the job's pre-training:

- bundle ID;
- dataset SHA-256;
- config SHA-256.

It must also match the SHA-256 reported by the fixed packager.

If post-write validation fails, TP-0.63 deletes the generated handoff and returns an error.

## Renderer privacy boundary

The generated handoff embeds training JSONL and can be large/sensitive. TP-0.63 does **not** return the handoff body to the renderer.

Only a bounded receipt crosses IPC:

- job ID;
- workspace ID;
- relative bundle/result/handoff paths;
- bundle ID;
- dataset/config fingerprints;
- handoff SHA-256;
- packaging timestamp;
- disclosure.

Absolute filesystem paths and training message content are not returned.

## Workspace lifecycle

A successful TP-0.62 `TRAIN` job no longer triggers immediate best-effort workspace revocation in Settings. Authority is retained temporarily so TP-0.63 can package the job-bound result.

After successful handoff packaging, Settings attempts to revoke the workspace authority. Operators can also revoke manually.

Failed/cancelled/dry-run terminal jobs continue to release authority through the TP-0.62 cleanup path.

## Lifecycle boundary

TP-0.63 handoff packaging remains transport/governance only.

It does not:

- register a training candidate;
- run MioBench;
- scan adapter bytes;
- create TP-0.59 binding evidence;
- sign model provenance;
- move a manifest to release candidate;
- promote a model;
- activate a model;
- upload, publish, or deploy anything.

The next explicit step remains importing the generated handoff through **Settings → Governed Training Run Handoff**, where TP-0.58 verification and candidate registration rules still apply.

## CI contract

`MIO Training Runner Contract` verifies:

- the fixed Python runner is packaged;
- the fixed TP-0.58 handoff utility is packaged;
- training uses `shell: false`;
- handoff packaging uses `shell: false`;
- handoff packaging uses `ELECTRON_RUN_AS_NODE=1`;
- the fixed packager and fixed handoff filename markers are present;
- generic `exec(...)` / `shell:true` are absent;
- existing TP-0.58 packager self-test still passes.

## Regression coverage

The desktop training gateway tests verify:

- start and handoff capabilities fail closed outside desktop;
- TP-0.63 is independently HIGH/L4/no-network;
- fixed handoff filename derivation;
- path-scope mismatch rejected before permission/IPC;
- explicit L4 approval produces one bounded packaging receipt;
- receipt identity matches the pre-training bundle identity;
- receipt recovery is read-only and requires no additional execution grant;
- TP-0.62 status/cancel/log bounds remain intact.

## Non-goals

TP-0.63 intentionally does not provide:

- generic file creation;
- generic filesystem writes;
- arbitrary Node scripts;
- arbitrary Electron-as-Node execution;
- arbitrary child-process arguments;
- automatic candidate registration;
- automatic promotion or activation.
