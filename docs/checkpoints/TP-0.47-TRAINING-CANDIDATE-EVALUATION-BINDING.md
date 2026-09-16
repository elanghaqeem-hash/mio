# TP-0.47 — Training Candidate Evaluation Binding

## Objective

Bind a completed TP-0.46 training result to the exact governed bundle that produced it, register the result as an auditable MIO model candidate, and run MioBench without allowing benchmark success to become implicit lifecycle advancement, promotion, activation, publication, or deployment authority.

## Delivered scope

### Training-result identity binding

`TrainingCandidateRegistry.register(...)` accepts:

- the original `MioTrainingBundleManifest`;
- the local `mio-training-result.json` contract produced by TP-0.46;
- a runtime model identity;
- a scoped local artifact URI.

Registration verifies exact agreement for:

- bundle ID;
- dataset SHA-256;
- canonical config SHA-256;
- base model;
- target model;
- LoRA/QLoRA method;
- eligible example count;
- result lifecycle/status contract;
- training timestamp relative to the bundle.

The complete training-result object is canonicalized and SHA-256 fingerprinted. Candidate identity is derived from the governed bundle plus this training-result fingerprint.

### Candidate lifecycle boundary

A valid result is registered as a normal `MioModelManifest` with:

- lifecycle `EXPERIMENTAL`;
- `dataGovernanceReviewed = false`;
- `securityReviewed = false`;
- bounded adapter artifact URI;
- exact training dataset fingerprint and example count.

Registration never creates `RELEASE_CANDIDATE` or `PROMOTED` state and never changes the active promoted-model pointer.

### Artifact URI restriction

Candidate artifacts are references, not arbitrary web downloads. TP-0.47 accepts only scoped local URI schemes:

- `training-artifact://`
- `workspace://`
- `local-model://`

Ordinary HTTP/HTTPS artifact references are rejected by this registry.

### MioBench binding

`TrainingCandidateRegistry.evaluate(...)`:

1. loads the registered candidate and its model manifest;
2. rejects promoted/retired candidates as inappropriate for this evaluation flow;
3. runs `MioBenchRunner` using the supplied provider;
4. requires the benchmark report's returned model identity to exactly match `manifest.runtimeModel`;
5. persists only identity-matched reports in `BenchmarkReportRepository`;
6. computes the candidate benchmark-policy decision;
7. records either:
   - `BENCHMARKED_POLICY_PASS`, or
   - `BENCHMARKED_POLICY_FAIL`.

A policy pass is evidence for later review only. It does not mutate `MioModelManifest.lifecycle`.

### Default benchmark policy

If a caller does not supply a policy, the registry uses conservative defaults:

- minimum pass rate: 0.90;
- minimum score ratio: 0.90;
- required domains derived from the governed training bundle where compatible with MioBench;
- fallback to all six MioBench core domains if no compatible domain was specified.

The existing `ModelPromotionGate` remains the only path that may produce a promoted manifest after its separate release-candidate and review requirements are satisfied.

## Security properties

TP-0.47 does **not**:

- execute training;
- download model artifacts;
- accept arbitrary remote artifact URLs;
- auto-approve data governance review;
- auto-approve security review;
- move an EXPERIMENTAL model to RELEASE_CANDIDATE;
- promote a model;
- activate a model;
- alter the current active promoted model;
- deploy or publish model weights.

A benchmark identity mismatch fails closed and does not overwrite the last valid candidate benchmark state.

## Persistence model

Candidate records are stored in the existing `training` storage namespace and keep:

- candidate/model-manifest ID;
- originating bundle ID;
- local artifact URI;
- training-result SHA-256;
- dataset SHA-256;
- config SHA-256;
- candidate status;
- latest valid benchmark report ID/time.

The actual benchmark report remains stored by the existing `BenchmarkReportRepository`; TP-0.47 links to that report rather than creating a second benchmark store.

## Validation focus

Regression coverage verifies:

- registration always begins as `EXPERIMENTAL`;
- governance/security review flags remain false;
- active promoted pointer is untouched;
- exact bundle fingerprints are bound;
- tampered dataset fingerprint fails registration;
- HTTP artifact URI fails registration;
- identity-matched MioBench output may record policy pass;
- policy pass does not advance lifecycle;
- benchmark report persists and is linked to the candidate;
- model identity mismatch fails closed;
- a rejected mismatch does not replace a prior valid benchmark state.

## Flow

```text
TP-0.46 governed bundle
        +
TRAINED_NOT_EVALUATED result
        │
        ▼
TrainingCandidateRegistry
  ├─ exact bundle/result identity checks
  ├─ local artifact URI check
  └─ training-result SHA-256
        │
        ▼
EXPERIMENTAL model manifest
REGISTERED_UNEVALUATED
        │
        ▼
MioBench evaluation
        │
        ├─ identity mismatch ──> reject
        │
        └─ identity match
              │
              ▼
     BENCHMARKED_POLICY_PASS/FAIL
              │
              ▼
      explicit human/governance review
              │
              ▼
        RELEASE_CANDIDATE
              │
              ▼
       existing ModelPromotionGate
              │
              ▼
            PROMOTED
```

## Deferred follow-up

Recommended next checkpoint:

- candidate import/review UI in Settings;
- local artifact selection through desktop workspace authority;
- benchmark start/status UI;
- explicit reviewed transition from EXPERIMENTAL to RELEASE_CANDIDATE;
- richer benchmark-to-training lineage display;
- adapter integrity hash and local artifact existence checks through a desktop-only capability.
