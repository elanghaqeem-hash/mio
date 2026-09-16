# TP-0.59 — Training Handoff ↔ Adapter Integrity Binding

## Objective

Bind the verified TP-0.58 training-run handoff identity to the actual adapter/model bytes measured by TP-0.50, so training metadata and local artifact integrity can no longer be treated as unrelated evidence during release review and promotion.

TP-0.59 remains a governance/evidence layer. It does not benchmark, sign, promote, activate, upload, deploy, or infer model safety.

## Scope

### Lightweight handoff receipt

`TrainingRunHandoffService` now persists a compact `TrainingRunHandoffReceipt` after a successful TP-0.58 registration.

The receipt stores only identity metadata:

- candidate + manifest IDs;
- handoff SHA-256;
- training-result SHA-256;
- bundle ID;
- dataset SHA-256;
- config SHA-256;
- verified handoff timestamp;
- registration timestamp.

The full training dataset/handoff payload is **not** duplicated into receipt storage.

Receipt persistence is idempotent. Re-registering the same handoff returns the existing receipt. Conflicting immutable receipt fields fail closed.

### Explicit handoff-to-adapter binding

`TrainingArtifactBindingService` creates `TrainingArtifactBindingEvidence` only after both of these exist and are mutually consistent:

1. a verified TP-0.58 handoff receipt; and
2. current TP-0.50 adapter byte-integrity evidence.

The binding records:

- handoff receipt ID + handoff SHA-256;
- training-result SHA-256;
- bundle/dataset/config identity;
- exact adapter-integrity evidence ID;
- adapter fingerprint + immutable baseline fingerprint;
- runtime model alias + artifact URI;
- integrity comparison (`BASELINE_CAPTURED` or `MATCH` only);
- binding timestamp;
- deterministic binding SHA-256.

`DRIFT` can never be bound.

### Current-binding semantics

For release review and pre-promotion checks, the binding must point to the **latest** adapter-integrity scan.

A later TP-0.50 scan therefore makes the previous binding stale even when the adapter fingerprint remains unchanged and the new scan is `MATCH`.

This is intentional: every release/promotion decision should reference the exact scan evidence that was current for that decision.

The operator must explicitly use **BIND CURRENT SCAN** again to create a new current binding.

### Historical verification

A binding that becomes stale for current review remains independently verifiable against the historical integrity evidence ID it originally referenced.

This supports promotion/activation audit without incorrectly requiring a promotion-time binding to point to the newer TP-0.52 post-promotion scan.

### Release-candidate gate

`TrainingCandidateReviewService` now:

- detects whether a candidate was registered through a TP-0.58 handoff receipt;
- requires a valid current TP-0.59 binding only for those candidates;
- remains backward-compatible for legacy/three-file candidate registrations;
- records the binding evidence ID/SHA in release-review notes when present.

Missing, stale, tampered, mismatched, or drifted binding evidence blocks release review.

### Promotion gate

`ModelPromotionService` applies the same requirement for handoff-registered candidates.

Promotion provenance can now record:

```text
artifactBindingEvidenceId
```

This ID is stored alongside benchmark, integrity, and optional signed-provenance evidence IDs.

A scan that occurs after release review makes the old binding stale; promotion is blocked until the latest clean scan is explicitly rebound.

### Activation revalidation

TP-0.52 still requires a **new post-promotion adapter integrity scan** before activation.

TP-0.59 does not replace this requirement. Instead, activation additionally checks that the `artifactBindingEvidenceId` recorded at promotion still exists and independently verifies against:

- the TP-0.58 handoff receipt;
- the candidate/manifest identity;
- the exact historical integrity scan referenced by the binding;
- the stored binding SHA-256.

This means:

- promotion-time binding remains historical evidence;
- post-promotion scan remains the current runtime-integrity evidence;
- a newer scan does not invalidate historical promotion evidence;
- deleted/tampered promotion binding evidence blocks activation.

## Settings UI

`TrainingArtifactBindingPanel` is exposed in Settings between the training-run handoff and Candidate Lab flows.

For TP-0.58 candidates it shows:

- handoff hash prefix;
- latest integrity state;
- binding state: `MISSING`, `STALE`, or `CURRENT`;
- current binding SHA and referenced scan ID;
- explicit `BIND CURRENT SCAN` action;
- fail-closed reasons when binding is not possible.

The action never scans a directory automatically. TP-0.50 scan authority remains a separate explicit desktop action.

## Backward compatibility

A candidate without a TP-0.58 receipt is not forced through TP-0.59.

This preserves the previous three-file Candidate Lab workflow and historical test fixtures while making the stronger binding mandatory for the new governed handoff path.

## Security properties

TP-0.59 does **not**:

- embed or duplicate the training dataset in receipt storage;
- assume a handoff proves adapter bytes;
- automatically bind after scanning;
- move the immutable TP-0.50 baseline;
- allow `DRIFT` to become a new baseline;
- benchmark a model;
- create provenance signatures;
- promote or activate a model;
- execute Python/ML training;
- upload or deploy artifacts.

The binding SHA-256 detects stored binding-body tampering. It does not independently authenticate the operator or replace TP-0.53+ signed provenance.

## Regression coverage

`trainingArtifactBindingTests` verifies:

- verified TP-0.58 receipt persists exact handoff/result identity;
- duplicate identical registration returns the original receipt timestamp;
- first clean TP-0.50 scan is bindable but not implicitly bound;
- release review blocks before explicit binding;
- binding links exact handoff SHA, result SHA, scan evidence ID, and adapter fingerprint;
- binding SHA self-verifies;
- stored binding-body tampering is detected;
- a newer identical `MATCH` scan makes current-review binding stale;
- historical binding still verifies against its referenced older scan;
- explicit re-bind binds the latest scan;
- adapter `DRIFT` invalidates current binding and blocks replacement binding;
- release review surfaces binding failure;
- legacy/non-handoff candidates remain backward-compatible.

Existing promotion/activation tests also continue to protect the previously established lifecycle and post-promotion integrity boundaries.

## Evidence flow

```text
TP-0.58 verified handoff
        │
        ▼
TrainingRunHandoffReceipt
  handoff SHA / result SHA
        │
        ├──────────────────┐
        │                  │
        │          TP-0.50 explicit scan
        │                  │
        │                  ▼
        │        AdapterIntegrityEvidence
        │        fingerprint + baseline
        │                  │
        └──────────┬───────┘
                   ▼
       explicit BIND CURRENT SCAN
                   │
                   ▼
      TrainingArtifactBindingEvidence
      + deterministic binding SHA-256
                   │
          ┌────────┴─────────┐
          ▼                  ▼
   Release review       Promotion gate
                              │
                              ▼
                 promotion provenance stores
                 artifactBindingEvidenceId
                              │
                              ▼
                  TP-0.52 new post-promotion
                  adapter integrity MATCH scan
                              │
                              ▼
                  activation revalidates both:
                  - historical promotion binding
                  - current post-promotion bytes
```

## Recommended follow-up

Possible next checkpoint:

- signed training-run receipt/attestation from a dedicated offline training authority;
- optional GPU/VRAM preflight and governed local training job planning;
- candidate evidence package export combining bundle/result/handoff/binding/benchmark/provenance IDs without embedding model weights.
