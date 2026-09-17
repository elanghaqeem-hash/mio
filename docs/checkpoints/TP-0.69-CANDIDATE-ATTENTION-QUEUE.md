# TP-0.69 — Candidate Attention Queue

## Purpose

Provide a compact, read-only operator queue for governed model candidates that currently need human attention, using the existing TP-0.65 lifecycle projection as the only source of lifecycle semantics.

TP-0.69 does not introduce a model-quality score, ranking model, promotion recommendation, or automation policy.

## Attention classes

Only two operational classes exist:

- `BLOCKED` — the existing lifecycle projection reports a blocking gate state.
- `ACTION_REQUIRED` — the existing lifecycle projection reports an explicit operator action is available.

Candidates whose current stages are only `COMPLETE`, `PENDING`, `OPTIONAL`, or `NOT_APPLICABLE` are not added to the attention queue.

A healthy `ACTIVE` candidate is therefore absent from the queue unless an existing lifecycle authority later reports a blocker/action through the lifecycle read model.

## Projection rules

`CandidateAttentionQueueService` reads `CandidateLifecyclePipelineService.list()` and selects the candidate's existing `nextStageId` when that stage is `BLOCKED` or `ACTION_REQUIRED`. If that pointer is unavailable, it falls back to the first stage in the lifecycle snapshot with one of those two states.

The service copies only descriptive fields required for operator triage:

- candidate / manifest identity
- display and runtime model identity
- lifecycle and overall state
- current stage
- detail
- existing action label / surface
- existing blockers

It does not call any mutation service.

## Ordering

Ordering is deterministic and operational only:

1. `BLOCKED`
2. `ACTION_REQUIRED`
3. established lifecycle stage order
4. runtime-model text
5. candidate ID

This ordering is not a model-quality score and does not imply which candidate should be promoted.

## UI

`CandidateAttentionQueuePanel` is rendered immediately before the full Candidate Lifecycle Pipeline inside `PromotedModelPanel`.

It provides:

- `ALL`, `BLOCKED`, and `ACTION` filters;
- live-sync through TP-0.68 invalidation coordination;
- manual refresh;
- existing blocker/action descriptions;
- `GO TO CANDIDATE` through TP-0.67 deep-focus navigation when the action surface is allowlisted.

Navigation remains UI-only and never presses a button, fills a form, grants a permission, or invokes a lifecycle action.

## Governance boundaries

TP-0.69 does **not**:

- score or rank model quality;
- predict benchmark, review, promotion, or activation outcomes;
- create new blockers or eligibility policy;
- train, benchmark, scan, bind, review, promote, or activate;
- trust/revoke signers;
- alter ModelRouter;
- invoke runtime inference/readiness;
- perform network access.

The existing lifecycle services remain authoritative.

## Regression coverage

`candidateAttentionQueueTests.ts` verifies:

- only `BLOCKED` / `ACTION_REQUIRED` snapshots enter the queue;
- healthy ACTIVE candidates are omitted;
- PENDING-only candidates are not represented as executable actions;
- blockers are preserved descriptively;
- BLOCKED is grouped before ACTION_REQUIRED;
- action ordering follows deterministic lifecycle stage order;
- disclosure explicitly rejects model-quality scoring;
- the service performs only a single injected read-model provider call.

## Validation gates

Before merge:

- MIO Validation Gate
- Cloudflare Web Build
- MIO Training Runner Contract
