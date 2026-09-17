# TP-0.70 — Promoted Runtime Live Status Sync

## Purpose

Keep the MIO Local promoted-runtime status panel synchronized with the same persisted lifecycle evidence and model-router preference changes already used by TP-0.68, without polling or automatic readiness/inference requests.

## Change

`PromotedModelPanel` now subscribes to `subscribeCandidateLifecycleRefresh()` instead of listening only to `SystemPreferences`.

The shared coordinator already reacts to:

- successful `training` namespace persistence through metadata-only `STORAGE_MUTATION_V1`; and
- model-router / SystemPreferences changes.

The panel then re-reads only:

- `promotedModelActivationService.status()`; and
- `promotedModelActivationService.listPromoted()`.

These are read-model/status operations. They do not execute runtime readiness.

## UI behavior

- `LIVE SYNC` is displayed in the promoted-runtime panel.
- manual `REFRESH` remains available;
- foreground and background refresh indicators are independent;
- latest-request-wins prevents stale async reads from replacing newer status;
- live-refresh errors are shown separately from explicit activation result messages.

## Governance boundaries

TP-0.70 does **not**:

- activate a model automatically;
- call live runtime readiness automatically;
- perform inference;
- scan adapter bytes;
- mutate signer trust or provenance;
- promote or retire a manifest;
- change ModelRouter;
- grant capabilities;
- perform polling or network access.

Explicit `ACTIVATE` continues to be the only path in this panel that invokes `activatePromoted()` and its readiness checks.

## Regression coverage

The TP-0.68 live-refresh regression now verifies event fan-out to multiple independent read-model subscribers, matching the queue, lifecycle pipeline, and promoted-runtime status consumers.

## Validation gates

Before merge:

- MIO Validation Gate
- Cloudflare Web Build
- MIO Training Runner Contract
