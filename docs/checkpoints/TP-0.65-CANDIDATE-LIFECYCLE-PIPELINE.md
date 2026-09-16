# TP-0.65 — Candidate Lifecycle Pipeline

## Purpose

TP-0.65 adds a read-only operational projection of the existing governed model lifecycle so an operator can see what is complete, what is blocked, and which existing surface/gate should be used next.

It does **not** add a second lifecycle engine and does not weaken any existing gate.

## Pipeline stages

The projection covers ten stages:

1. Candidate registration
2. Governed TP-0.58 handoff
3. TP-0.50 adapter byte integrity
4. TP-0.59 handoff ↔ adapter binding
5. MioBench policy
6. Explicit RELEASE_CANDIDATE review
7. Signed artifact provenance
8. Explicit final promotion
9. Fresh post-promotion integrity
10. MIO Local activation

Each stage is reported as one of:

- `COMPLETE`
- `ACTION_REQUIRED`
- `BLOCKED`
- `PENDING`
- `OPTIONAL`
- `NOT_APPLICABLE`

`ACTION_REQUIRED` is only an operational direction to run an existing gate. It is never a pre-approval or guarantee that the gate will pass.

## Authority model

`CandidateLifecyclePipelineService` is deliberately read-only.

It reads from existing authorities:

- `TrainingCandidateRegistry`
- `TrainingCandidateReviewService`
- `ModelPromotionService`
- `ModelManifestRepository`
- `PromotedModelActivationService.status()` for current active-model health

It does not expose methods to:

- register a candidate;
- create integrity/provenance/binding evidence;
- benchmark a candidate;
- advance to RELEASE_CANDIDATE;
- promote a model;
- set the active promoted pointer;
- activate a model;
- mutate ModelRouter.

Release-review blockers and final-promotion blockers are surfaced from their existing services rather than reimplemented as a competing policy.

## Promotion evidence semantics

Before promotion, a TP-0.58 candidate needs a current valid TP-0.59 handoff ↔ adapter binding for release review/promotion as required by the existing gates.

After promotion, the pipeline does **not** incorrectly require that same current-review binding to remain current forever. Promotion stores the exact historical TP-0.59 evidence ID in structured promotion provenance. A later post-promotion adapter scan can make the current review binding stale while the historical promotion-time binding remains the evidence that activation revalidates.

Signed provenance follows the same identity discipline after promotion: if promotion bound a `provenanceEvidenceId`, the pipeline requires the current available provenance record to match that promotion-bound evidence and its signer to remain trusted. A newly introduced provenance record is not silently substituted for promotion provenance.

## Activation interpretation

TP-0.65 intentionally does not perform live runtime readiness requests during dashboard refresh.

For a PROMOTED model:

- a fresh post-promotion TP-0.50 `MATCH` is required before activation is shown as actionable;
- the actual existing activation gate remains responsible for revalidating promotion-time binding/provenance, signer trust, post-promotion integrity, and live local-runtime readiness before ModelRouter can change;
- `ACTIVE` is accepted only when the existing `PromotedModelActivationService.status()` reports `ACTIVE` for that same manifest;
- `INTEGRITY_BLOCKED`, configuration drift, signer revocation, or other activation-health problems are therefore not hidden merely because an old active pointer/router configuration still exists.

## Signed provenance

Signed provenance remains optional only while no provenance evidence has been introduced for the candidate under the current policy. Once signed provenance exists, invalid binding or untrusted signer state is surfaced as a blocker by the existing review/promotion/activation authorities.

## UI

`CandidateLifecyclePipelinePanel` appears before the existing promotion/activation controls in Settings.

It provides:

- candidate count;
- blocked count;
- promoted-but-not-active count;
- active count;
- per-candidate lifecycle and benchmark status;
- ten stage cards;
- bounded blocker display;
- next required action and the existing Settings surface where that action belongs.

The panel contains no lifecycle mutation button.

## Regression contract

`candidateLifecyclePipelineTests.ts` verifies that:

- a registered candidate produces the expected ten-stage projection;
- missing integrity/MioBench are surfaced without being executed;
- refresh does not mutate candidate or manifest storage;
- refresh does not set an active promoted pointer;
- activation health is read through the existing activation-status authority rather than inferred from router configuration;
- a MioBench pass is reflected without changing lifecycle;
- an explicit existing release-review transition is reflected correctly;
- a RELEASE_CANDIDATE without required promotion-time integrity remains blocked by the existing `ModelPromotionService` blocker;
- list refresh does not create synthetic candidate records or mutate storage.

## Explicit non-goals

TP-0.65 does not:

- train a model;
- package or import handoff files;
- create evidence;
- run MioBench;
- perform review attestations;
- promote a model;
- activate a model;
- perform live model generation/readiness requests during refresh;
- use network access;
- change the active model router.
