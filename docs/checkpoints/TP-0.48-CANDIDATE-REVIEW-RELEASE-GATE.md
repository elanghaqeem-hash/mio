# TP-0.48 — Candidate Review & Release-Candidate Gate

## Objective

Add an explicit human review boundary between an EXPERIMENTAL training candidate that passed its bound MioBench policy and a RELEASE_CANDIDATE model manifest, without combining that review with promotion or runtime activation.

## Delivered scope

### Review service

`TrainingCandidateReviewService` composes the existing:

- `TrainingCandidateRegistry`;
- `ModelManifestRepository`;
- `BenchmarkReportRepository`;
- `ModelPromotionGate` readiness logic.

A candidate is reviewable only when:

- its manifest is still `EXPERIMENTAL`;
- candidate state is `BENCHMARKED_POLICY_PASS`;
- a bound benchmark report exists;
- the candidate benchmark pointer matches the latest stored report;
- benchmark model identity matches `manifest.runtimeModel`;
- benchmark does not predate the candidate manifest;
- the benchmark still satisfies the candidate's benchmark policy when re-evaluated.

### Explicit human attestations

Advancing to `RELEASE_CANDIDATE` requires all of:

- a non-empty reviewer identity;
- explicit data-governance review attestation;
- explicit security review attestation.

The transition persists:

- lifecycle `RELEASE_CANDIDATE`;
- `dataGovernanceReviewed = true`;
- `securityReviewed = true`;
- reviewer identity;
- review timestamp;
- note referencing the benchmark report used for readiness revalidation.

### Separation from promotion

Before saving the release-candidate manifest, the service constructs the prospective reviewed manifest and calls the existing promotion-readiness evaluator against the bound benchmark report. This is a revalidation only.

The service does **not** call `promoteManifest(...)`, does not write `PROMOTED`, and does not set the active promoted-model pointer.

A separate explicit promotion action remains required after the release-candidate state exists.

### Settings UI

`TrainingCandidatePanel` is added before the existing promoted-model activation panel.

It shows:

- registered candidate display/runtime identity;
- LoRA/QLoRA method and base model;
- lifecycle;
- candidate benchmark state;
- eligible example count;
- latest benchmark model/pass rate/report ID;
- explicit blocking reasons if release review is not ready.

For a ready EXPERIMENTAL candidate, the user must intentionally select `REVIEW FOR RC`, enter reviewer identity, and check two distinct attestations:

1. data-governance review completed;
2. security review completed.

Only then is `ADVANCE TO RELEASE_CANDIDATE` enabled.

The UI explicitly states that this action does not promote or activate the model.

## Security properties

TP-0.48 does **not**:

- train a model;
- run arbitrary model files;
- change training bundle fingerprints;
- accept a failed benchmark as release-ready;
- infer review completion automatically;
- permit blank/anonymous reviewer identity;
- promote a model;
- activate a model;
- change model-router configuration;
- publish/deploy model artifacts.

A release-candidate transition cannot be replayed to silently overwrite an existing completed review.

## Validation focus

Regression tests verify:

- benchmark-policy pass makes an EXPERIMENTAL candidate review-eligible;
- inspection itself never mutates lifecycle;
- missing data-governance attestation fails closed;
- missing security attestation fails closed;
- complete explicit review can transition to `RELEASE_CANDIDATE`;
- reviewer and both review flags persist;
- active promoted-model pointer remains empty/unchanged;
- lifecycle persists through `ModelManifestRepository`;
- repeated transition is rejected;
- post-transition UI/service state no longer offers the same release-candidate action.

## Flow

```text
TRAINED_NOT_EVALUATED
        │
        ▼
EXPERIMENTAL candidate
        │
        ▼
Identity-bound MioBench
        │
        ▼
BENCHMARKED_POLICY_PASS
        │
        ▼
Release Review UI
  ├─ reviewer identity
  ├─ data-governance attestation
  └─ security attestation
        │
        ▼
Benchmark/policy revalidation
        │
        ▼
RELEASE_CANDIDATE
        │
        ▼
separate explicit ModelPromotionGate action
        │
        ▼
PROMOTED
        │
        ▼
separate promoted-model activation
```

## Deferred follow-up

Recommended future work:

- desktop-only candidate artifact file integrity hashing/existence validation;
- governed import UI for `manifest.json` + `mio-training-result.json`;
- benchmark execution UI against a selected local candidate backend;
- dedicated explicit promotion UI requiring final reviewer confirmation;
- immutable review-event/audit timeline separate from mutable manifest summary;
- optional reviewer-role/organization policy when MIO gains multi-user identity management.
