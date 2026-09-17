# TP-0.68 — Candidate Lifecycle Live Refresh

## Purpose

Keep the TP-0.65/0.66/0.67 Candidate Lifecycle Pipeline synchronized with successfully persisted lifecycle evidence and local model-router configuration changes without polling and without introducing a new lifecycle authority.

## Architecture

### Observable default storage

`StorageRuntime` wraps the default IndexedDB/in-memory provider in `ObservableStorageProvider`.

After a successful `set`, `delete`, or `clearNamespace`, the wrapper emits `STORAGE_MUTATION_V1` through the existing MIO `eventBus`.

The event contains only:

- schema version
- storage namespace
- operation
- optional key
- timestamp

The event never contains the persisted value, training JSONL, benchmark data, signatures, keys, model artifacts, prompts, or other content.

A failed persistence operation emits no invalidation event.

### Candidate lifecycle refresh coordinator

`CandidateLifecycleRefreshCoordinator` subscribes to:

1. successful storage mutations in namespace `training`; and
2. `SystemPreferences` changes that may alter current model-router / activation projection.

Events are debounced into one read-only lifecycle refresh. Non-training storage mutations are ignored.

### Pipeline behavior

`CandidateLifecyclePipelinePanel` keeps the manual `REFRESH` control and additionally shows `LIVE SYNC`.

Background refreshes:

- call only the existing read-only `CandidateLifecyclePipelineService.list()` projection;
- do not execute lifecycle actions;
- use latest-request-wins data application;
- keep foreground and background loading state independent so overlapping refreshes cannot leave the manual spinner stuck.

## Governance boundaries

TP-0.68 does **not**:

- train a model;
- create or modify evidence;
- benchmark a candidate;
- perform release review;
- trust/revoke a signer;
- promote a manifest;
- activate a runtime;
- change ModelRouter;
- grant capabilities/permissions;
- perform runtime inference/readiness requests;
- poll storage or network endpoints.

Storage mutation events are cache/read-model invalidations only. Existing repositories/services remain the source of truth.

## Regression coverage

`candidateLifecycleLiveRefreshTests.ts` verifies:

- successful writes emit invalidation only after persistence;
- mutation events do not expose persisted values;
- delete and namespace-clear metadata contracts;
- failed writes emit no invalidation;
- non-training mutations are ignored by lifecycle refresh;
- training bursts and preference changes debounce to one refresh callback;
- unsubscribe cancels pending work and detaches both sources.

## Validation gates

Before merge:

- MIO Validation Gate
- Cloudflare Web Build
- MIO Training Runner Contract
