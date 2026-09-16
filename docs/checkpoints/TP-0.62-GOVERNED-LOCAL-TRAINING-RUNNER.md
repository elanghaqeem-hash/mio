# TP-0.62 — Governed Local Training Runner

## Status

Implementation checkpoint for desktop-only governed execution of the existing TP-0.46 LoRA/QLoRA runner.

TP-0.62 closes the operational gap between a verified governed training bundle and the TP-0.58 result/handoff path without turning Mio into a generic shell or process launcher.

## Objective

Allow a human operator to explicitly start the fixed local training runner from Mio Desktop while preserving the existing security boundaries:

```text
Settings operator
  -> explicitly authorize a desktop workspace
  -> START L4 request
  -> CapabilityRegistry
  -> SecureServiceGateway
  -> scoped PermissionEngine grant
  -> trusted preload IPC
  -> TrainingJobManager
  -> fixed training/train_mio_lora.py
  -> bounded local Python process
  -> mio-training-result.json
  -> TP-0.58 handoff remains required
```

## Capability contract

Capability:

`service.desktop.training.start`

Properties:

- kind: `SERVICE`
- mode: `SETTINGS` only
- risk: `HIGH`
- permission: `L4_EXECUTE`
- network access: `false`
- scope: `TASK + RESOURCE + PATH`
- resource: explicitly authorized workspace ID
- path scope: run mode + Python launcher + bundle relative path + output relative path
- capability is `UNAVAILABLE` by default and becomes available only in the desktop registry.

Only the start operation is an execution capability. Read-only status/list operations and cancellation do not consume repeated L4 grants. Cancellation is intentionally always available as a safety control.

## Fixed-entrypoint boundary

The renderer cannot provide a command string, executable path, Python script path, shell arguments, environment map, model URL, or arbitrary CLI flags.

The Electron main process chooses the runner itself:

- development: `<appPath>/training/train_mio_lora.py`
- packaged desktop: `<resources>/training/train_mio_lora.py`

The runner must be a regular file inside the trusted application training resource. Symlinked or escaped runner paths are rejected.

Allowed Python launchers are limited to:

- `python`
- `python3`
- `py -3` on Windows

The process is always spawned with `shell: false`.

## Workspace boundary

The operator must explicitly select a directory through the existing desktop workspace authorization picker.

The training bridge accepts only:

- `workspaceId`
- bundle **relative** path
- output **relative** path for real training
- whitelisted Python launcher
- `DRY_RUN` or `TRAIN`

Absolute paths remain unavailable to the renderer. Workspace canonicalization and containment reuse `WorkspaceSandbox.resolveExisting(...)`.

For real training:

- output must already exist;
- output must be a directory;
- output must be empty;
- automatic `--overwrite` is not exposed;
- output cannot be the bundle directory;
- output cannot be nested inside the governed bundle directory.

This prevents the training process from using its output path to mutate the evidence bundle it is consuming.

## Process environment

The child process receives a minimized environment allow-list rather than the complete Mio/Electron environment.

TP-0.62 forces:

- `HF_HUB_OFFLINE=1`
- `TRANSFORMERS_OFFLINE=1`
- `HF_DATASETS_OFFLINE=1`
- `WANDB_DISABLED=true`
- `PYTHONUNBUFFERED=1`
- `TOKENIZERS_PARALLELISM=false`
- `MIO_GOVERNED_TRAINING=1`

No API keys, cloud-provider secrets, browser credentials, Mio permission grants, or arbitrary user-supplied environment variables are deliberately passed into the training process.

The capability declares `networkAccess: false`. These controls provide application-level offline minimization and prevent the supported runner from downloading model/data resources. They are **not** an operating-system firewall; operators requiring hard network isolation should run the training workstation/container in an OS/network sandbox as well.

## Job lifecycle

Training is asynchronous. IPC start returns a bounded job snapshot rather than holding an IPC invocation for the full training duration.

States:

- `RUNNING`
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`

Only one governed training job may run at a time. Concurrent GPU training is intentionally blocked.

The job manager retains a bounded recent history so Settings can reconnect to a running job after navigation/remount.

Snapshot output is bounded:

- stdout tail: max 64 KiB
- stderr tail: max 64 KiB
- no model weights or adapter bytes are returned through IPC
- no absolute runner/bundle/output paths are returned through IPC.

## Cancellation and emergency behavior

Cancellation is a safety control and does not require another execution grant.

Normal cancel:

1. mark cancellation requested;
2. send `SIGTERM`;
3. after 3 seconds, if still running, escalate to `SIGKILL`;
4. terminal state becomes `CANCELLED` when the process closes.

`STOP MIO` from the renderer and system tray both request training cancellation.

Desktop authority shutdown / window close force-stops remaining training processes before workspace authorities are discarded.

A workspace cannot be revoked while an active training process is using it. A revoke request first requests cancellation and asks the operator/UI to retry after terminal state. This prevents an apparently revoked authority from leaving an already-running child process silently operating on its absolute paths.

## Packaging

`package.json` includes the governed training resource in Electron `extraResources`:

- `train_mio_lora.py`
- compatibility shim
- isolated requirements
- training configs

The Training Runner Contract CI verifies that the packaged resource contains the fixed runner and that the desktop manager retains the `shell: false` + offline environment markers.

## Settings UI

**Settings → Governed Local Training Runner** provides:

- explicit workspace authorization/revocation;
- bundle relative path;
- output relative path;
- `DRY_RUN` / `TRAIN` selector;
- Python launcher whitelist selector;
- explicit `START L4 ...` action;
- bounded live stdout/stderr tails;
- cancel control;
- job recovery/history;
- result-file relative path for the TP-0.58 next step.

The web/Cloudflare runtime renders this feature as unavailable and cannot spawn Python.

## Lifecycle boundary

A successful real training job produces the existing runner contract:

```text
status: TRAINED_NOT_EVALUATED
promotionStatus: NOT_EVALUATED
nextRequiredGate: MioBench + ModelPromotionGate
```

TP-0.62 does **not** automatically:

- create a TP-0.58 handoff;
- register a candidate;
- run MioBench;
- capture adapter integrity;
- bind TP-0.59 evidence;
- create signed provenance;
- review a release candidate;
- promote a model;
- activate a model;
- upload/publish/deploy an artifact.

The explicit next flow remains:

```text
TP-0.62 training result
 -> TP-0.58 handoff
 -> candidate registration
 -> TP-0.50 integrity
 -> TP-0.59 binding
 -> MioBench + review
 -> promotion
 -> post-promotion integrity
 -> activation
```

## Regression coverage

`desktopTrainingGatewayTests.ts` verifies:

- default/web runtime fails closed;
- desktop start capability is HIGH/L4/SETTINGS/no-network;
- arbitrary runtime/input is rejected before permission/IPC;
- scope binds bundle and output identities;
- scope mismatch is rejected before permission/IPC;
- status/history snapshots remain bounded and validated;
- cancellation is available as a safety control;
- oversized log snapshots are rejected by the renderer contract.

Electron compile and the existing MIO system/security suite additionally validate preload/main-process IPC wiring.

## Non-goals

TP-0.62 intentionally does not add:

- arbitrary shell/terminal access;
- custom Python script execution;
- arbitrary executable selection;
- remote training;
- model-hub download from the job UI;
- secret/environment injection;
- auto-overwrite of existing outputs;
- simultaneous training jobs;
- automatic lifecycle advancement.
