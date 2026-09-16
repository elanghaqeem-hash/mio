# TP-0.52 — Post-Promotion Integrity Activation Gate

## Status

Implementation checkpoint that hardens the final transition from a `PROMOTED` governed adapter candidate to an active MIO Local runtime.

TP-0.51 separates model promotion from runtime activation. TP-0.52 ensures that adapter bytes are checked again **after** promotion before activation can change ModelRouter configuration.

## Threat addressed

A candidate may be correctly reviewed, benchmarked, integrity-checked, and promoted, while the local adapter directory is modified afterward but before activation.

The promotion-time fingerprint therefore cannot, by itself, prove that the bytes being activated are still the promoted bytes.

## Structured promotion provenance

`MioModelManifest` now supports optional structured promotion provenance:

- final promoter identity;
- promotion timestamp;
- benchmark report id used for promotion;
- adapter-integrity evidence id used for promotion, when applicable.

The official TP-0.51 `ModelPromotionService` now writes this provenance when promotion succeeds.

Existing legacy/base manifests remain compatible because promotion provenance is optional at the schema level. When present, it is validated and is only valid on `PROMOTED` manifests.

## Governed adapter activation rule

When a promoted manifest has a governed `TrainingCandidateRegistry` record and is adapter-trained, activation requires:

1. structured official promotion provenance;
2. promotion provenance contains the integrity-evidence id used at promotion;
3. latest integrity evidence is bound to the exact candidate id;
4. latest integrity evidence is bound to the exact manifest id;
5. runtime model identity matches;
6. artifact URI matches;
7. `trainingResultSha256` matches;
8. latest integrity result is exactly `MATCH` against the immutable TP-0.50 baseline;
9. latest integrity evidence is **not** the same evidence used during promotion;
10. latest scan does not predate promotion.

This deliberately requires a fresh post-promotion re-scan before the first activation.

## Order of checks

Activation performs integrity checks **before** local runtime readiness and before any ModelRouter mutation.

```text
PROMOTED manifest
      ↓
Governed-candidate lookup
      ↓
Post-promotion integrity MATCH
      ↓
Loopback runtime readiness
      ↓
ModelRouter update
      ↓
Active promoted pointer
```

If integrity fails, no readiness call or routing change is attempted.

## Active runtime drift

The active promoted-model status now includes:

`INTEGRITY_BLOCKED`

If a later authorized integrity scan reports `DRIFT`, `PromotedModelActivationService.status()` exposes the problem instead of continuing to report `ACTIVE`.

MIO does **not** silently switch models, clear the active pointer, terminate a runtime, or rewrite user settings. The status change is observational and requires explicit user action.

If the directory is restored to the immutable baseline and a new authorized scan reports `MATCH`, status returns to `ACTIVE` when provider/model configuration still matches.

## Compatibility boundary

The additional activation-integrity contract applies when a promoted manifest is bound to a governed training candidate.

Legacy/base promoted manifests without a TrainingCandidateRegistry record continue to use the existing promoted lifecycle + review + local runtime readiness checks. This avoids retroactively inventing training provenance for models that predate the governed candidate pipeline.

## UI

The MIO Local Model Lifecycle panel now:

- explains that governed adapter candidates require fresh post-promotion byte-integrity MATCH;
- renders `INTEGRITY_BLOCKED` as a red warning state;
- displays structured promoter and benchmark provenance when available;
- includes the integrity evidence id in the successful activation message.

The actual hash action remains in Native Model Candidate Lab, preserving the existing explicit native directory picker and L4 desktop hashing permission boundary.

## No automatic authority

TP-0.52 does not:

- automatically scan arbitrary local directories;
- persist absolute filesystem paths;
- change the immutable integrity baseline;
- auto-promote a model;
- auto-activate after a scan;
- auto-deactivate or switch an active model after drift;
- start/stop local inference processes;
- upload, publish, deploy, or download model artifacts.

## Regression coverage

`postPromotionIntegrityActivationTests.ts` validates:

- promotion-time evidence alone cannot be reused for activation;
- integrity gate executes before backend readiness and ModelRouter mutation;
- fresh post-promotion scan must be new evidence and `MATCH` the immutable baseline;
- successful activation binds the exact post-promotion evidence id;
- successful activation updates MIO Local only after integrity + readiness pass;
- active promoted pointer is persisted only after success;
- later drift produces `INTEGRITY_BLOCKED`;
- drift reporting does not silently switch/deactivate the configured runtime;
- restoring baseline bytes and rescanning returns status to `ACTIVE`.

## Result

The governed adapter lifecycle now has byte-integrity checks at two distinct trust boundaries:

- **promotion boundary:** prove the reviewed release candidate matches the approved adapter baseline;
- **activation boundary:** prove the adapter still matches that baseline after promotion, immediately before runtime selection.
