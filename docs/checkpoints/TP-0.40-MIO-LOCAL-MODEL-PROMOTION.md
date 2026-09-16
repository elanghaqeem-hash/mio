# TP-0.40 — MIO Local Model Manifest & Promotion Gate

## Goal

Prevent experimental or merely-trained adapters from becoming the MIO Local default without evidence, identity binding, and explicit governance/security review.

## Delivered

- `src/training/ModelManifest.ts`
  - versioned model identity and lifecycle
  - base model / training method / adapter URI
  - dataset id, fingerprint, example count
  - benchmark thresholds and required domains
  - governance/security review state
- `src/training/BenchmarkReportRepository.ts`
  - persistent benchmark reports inside isolated `training` storage
  - latest/list queries scoped to a model manifest
- `src/training/ModelPromotionGate.ts`
  - release-candidate lifecycle requirement
  - model identity match between manifest and benchmark
  - report freshness requirement
  - minimum pass rate and score ratio
  - required-domain success checks
  - optional average-latency ceiling
  - data-governance and security review requirements
- `src/training/ModelManifestRepository.ts`
  - persistent validated manifests
  - explicit active promoted model pointer
  - non-promoted models cannot become active
- automated promotion regression tests

## Lifecycle

```text
EXPERIMENTAL
    ↓ training + iterative evaluation
RELEASE_CANDIDATE
    ↓ MioBench + data governance + security review + promotion gate
PROMOTED
    ↓ explicit active-pointer selection
ACTIVE MIO LOCAL MODEL
```

`RETIRED` remains available for manifests that should no longer be selected.

## Promotion invariants

A candidate is blocked when any of the following is true:

- manifest is invalid;
- lifecycle is not `RELEASE_CANDIDATE`;
- data-governance review is incomplete;
- security review is incomplete;
- benchmark model id does not equal `runtimeModel`;
- benchmark predates the manifest;
- pass rate is below threshold;
- score ratio is below threshold;
- any required benchmark domain has no passing result;
- optional latency ceiling is exceeded.

Only a manifest returned from the successful promotion path can be stored as the active promoted model.

## Important boundary

TP-0.40 does not silently change a user's current ModelRouter selection. Runtime activation should remain an explicit later action that resolves the active promoted manifest and verifies the corresponding local model is actually installed/reachable before changing provider/model preferences.

## Recommended next checkpoints

- TP-0.41: governed browser automation bridge (Playwright/Chromium)
- TP-0.42: vLLM and llama.cpp local inference adapters
- TP-0.43: explicit promoted-model activation service + Settings status UI
- Later: DPO/preference optimization after enough reviewed preference data exists
