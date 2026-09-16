# TP-0.51 — Explicit Model Promotion Gate

## Status

Implementation checkpoint for the explicit transition from `RELEASE_CANDIDATE` to `PROMOTED`.

This checkpoint closes the lifecycle gap between TP-0.48 release-candidate review and TP-0.43 promoted-model runtime activation.

It does **not** activate, deploy, publish, upload, train, or automatically select a model.

## Lifecycle after TP-0.51

```text
GOVERNED TRAINING DATA
        ↓
TRAINED_NOT_EVALUATED
        ↓
EXPERIMENTAL
        ↓
MioBench policy evaluation
        ↓
Human data-governance + security review
        ↓
RELEASE_CANDIDATE
        ↓
Final promotion revalidation + explicit final attestation
        ↓
PROMOTED
        ↓
Separate runtime readiness verification
        ↓
Explicit ACTIVATE
```

Promotion and activation remain deliberately separate operations.

## ModelPromotionService

`src/training/ModelPromotionService.ts` is the official governed promotion workflow.

### Inspection

For a release candidate, promotion readiness revalidates:

- lifecycle is exactly `RELEASE_CANDIDATE`;
- data-governance review is complete;
- security review is complete;
- a stored MioBench report exists;
- the existing `ModelPromotionGate` accepts the current manifest/report pair;
- benchmark runtime identity still matches the manifest;
- pass-rate, score-ratio, required-domain, and optional latency policy still pass.

For adapter-trained candidates, the service additionally requires:

- a governed `TrainingCandidateRegistry` binding;
- candidate status `BENCHMARKED_POLICY_PASS`;
- candidate benchmark pointer equals the latest stored benchmark report;
- adapter byte-integrity evidence exists;
- integrity evidence is bound to the exact candidate, manifest, runtime model, artifact URI, and `trainingResultSha256`;
- SHA-256 integrity fingerprints are structurally valid;
- latest integrity evidence is not `DRIFT` relative to the immutable TP-0.50 baseline.

An adapter-based manifest without governed candidate binding is blocked even when its manifest and benchmark appear otherwise valid.

## Explicit promotion action

`promote()` requires:

- a named promoter/final reviewer;
- explicit final attestation;
- all promotion-readiness checks to pass at action time.

The service then calls the existing `promoteManifest()` gate, saves lifecycle `PROMOTED`, and records the benchmark/evidence references in model notes.

The service does **not** call `setActivePromoted()` and does not modify ModelRouter configuration.

## Final Promotion UI

`ModelPromotionPanel` is rendered directly before the existing promoted-model runtime lifecycle panel.

The panel shows:

- release-candidate name and runtime identity;
- training method;
- latest MioBench pass and score metrics;
- benchmark report id;
- adapter-integrity status and fingerprint when available;
- every blocking reason when promotion is not eligible.

When eligible, the user must:

1. open `FINAL PROMOTION REVIEW`;
2. enter the promoter/final-review identity;
3. explicitly attest that the displayed MioBench, governance/security reviews, candidate identity, and adapter-integrity evidence are the intended evidence;
4. press `PROMOTE MODEL`.

The service revalidates everything after the button is pressed. UI eligibility alone is never trusted as authorization.

After promotion, the PROMOTED lifecycle panel refreshes immediately. The model still requires separate backend readiness verification and explicit `ACTIVATE`.

## Integrity relationship

TP-0.50 adapter hashing is evidence, not a quality score.

For governed adapter candidates, TP-0.51 requires integrity evidence because promotion is a stronger lifecycle claim than release-candidate review. The accepted integrity states are:

- `BASELINE_CAPTURED`: current bytes are the immutable first-scan baseline;
- `MATCH`: current bytes match that original baseline.

`DRIFT` blocks promotion.

A repeated scan of drifted bytes cannot move the baseline and cannot make the model promotion-eligible.

## Security and governance boundaries

TP-0.51 never:

- creates training data;
- trains a model;
- changes benchmark results;
- infers human review completion;
- bypasses adapter-integrity evidence for adapter candidates;
- changes the active model pointer;
- changes inference backend settings;
- starts a local runtime;
- uploads/publishes/deploys model artifacts;
- automatically promotes on benchmark pass.

A model can become `PROMOTED` only through the explicit final action.

## Regression coverage

`modelPromotionServiceTests.ts` validates:

- adapter release candidate is blocked without integrity evidence;
- baseline integrity evidence enables eligibility only when all other gates pass;
- integrity drift blocks promotion;
- restoring exact baseline bytes clears the integrity blocker;
- explicit final attestation is mandatory;
- successful action writes `PROMOTED`;
- final named promoter is recorded;
- promotion result binds the integrity evidence used;
- promotion does not activate the model;
- promoted lifecycle persists;
- promotion cannot be replayed to overwrite the final review implicitly.

## Result

TP-0.51 completes the governed lifecycle transition chain from trained candidate to promoted model while preserving the hard boundary between **promotion** and **runtime activation**.
