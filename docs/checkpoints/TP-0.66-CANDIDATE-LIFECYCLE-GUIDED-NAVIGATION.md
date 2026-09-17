# TP-0.66 — Candidate Lifecycle Guided Navigation

## Purpose

TP-0.66 improves the TP-0.65 Candidate Lifecycle Pipeline without creating a new lifecycle authority. Operators can now jump from an informational lifecycle stage to the existing Settings surface where that action is already governed.

The navigation layer is UI-only. It never executes the target action.

## Supported navigation targets

Stable Settings anchors are defined for:

- Native Model Candidate Lab
- Training Handoff ↔ Adapter Integrity
- Model Provenance / Signer Trust
- Training Candidate Release Review
- Final Model Promotion
- Promoted Model Runtime / Activation

Each anchor uses a bounded `mio-lifecycle-*` DOM id. Labels that are not explicitly mapped are not guessed.

## Navigation behavior

`GO TO SURFACE` performs only:

1. lookup of a known Settings anchor;
2. `scrollIntoView`;
3. temporary focus;
4. temporary visual ring/highlight.

It does not:

- click any target button;
- select a candidate automatically;
- fill reviewer/promoter fields;
- grant permissions;
- run MioBench;
- scan an adapter;
- create evidence;
- advance RELEASE_CANDIDATE;
- promote a model;
- activate a model;
- modify ModelRouter;
- perform network access.

Outside a browser DOM, the navigation helper returns `false` and performs no fallback side effect.

## Surface ownership

The guided-navigation surface map remains in `CandidateLifecycleNavigation.ts` rather than inside governance services. This keeps lifecycle rules and UI navigation concerns separate.

TP-0.65 remains the read-only lifecycle projection. Existing services remain the authorities for review, promotion, integrity, provenance, and activation.

## UI cleanup

TP-0.66 removes the duplicate `ModelProvenancePanel` previously nested inside `TrainingCandidatePanel`. Settings now has one explicit provenance/trust section, giving guided navigation a single stable destination and avoiding duplicate controls/state views.

## Regression contract

`candidateLifecycleGuidedNavigationTests.ts` verifies:

- all known lifecycle surface labels map to their intended target;
- unknown labels are rejected rather than guessed;
- DOM anchor ids are unique and bounded;
- surface labels resolve to stable ids;
- navigation fails closed in a non-browser runtime.

Existing TP-0.65 tests continue proving that pipeline refresh does not mutate candidate lifecycle, evidence, promotion state, active pointer, or ModelRouter.
