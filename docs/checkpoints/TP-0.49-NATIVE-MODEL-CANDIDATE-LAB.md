# TP-0.49 — Native Model Candidate Lab

## Status

Implementation checkpoint for the governed visual workflow between TP-0.46 training output and TP-0.48 release-candidate review.

The Candidate Lab does **not** train, promote, activate, publish, upload, or deploy a model.

## Objective

Turn the existing governed model-development primitives into a usable Settings workflow without weakening their authority boundaries.

The Lab supports:

1. importing `manifest.json` from a TP-0.46 bundle;
2. importing the exact `train.jsonl` represented by that manifest;
3. importing `mio-training-result.json` emitted by the isolated trainer;
4. verifying dataset/config fingerprints and bundle identity;
5. verifying the training-result binding against that bundle;
6. registering an EXPERIMENTAL candidate with a scoped artifact identity;
7. checking whether the configured loopback backend serves the candidate runtime identity;
8. running tool-free MioBench against the candidate;
9. running a bounded base-vs-candidate MioBench comparison;
10. preserving existing explicit release-candidate, promotion, and activation gates.

## Import boundary

Candidate Lab accepts three text artifacts:

```text
manifest.json
train.jsonl
mio-training-result.json
```

Each browser-selected file is limited to 64 MiB before reading. The service independently enforces the same bounded text limit.

The bundle is reverified through `verifyTrainingBundle()`:

- schema/format contract;
- `NOT_EVALUATED` promotion state;
- deterministic `stable-json-v1` config fingerprint;
- SHA-256 dataset fingerprint;
- derived bundle ID;
- example count;
- example ID order;
- domain/language/provenance counts;
- assistant-ending conversational rows.

The training result is then validated through an isolated in-memory `TrainingCandidateRegistry` registration. This reuses the same binding rules as real candidate registration without mutating the live registry.

A preview is therefore not registration.

## Candidate registration

A verified import still requires explicit runtime information:

- runtime model alias;
- scoped artifact URI;
- optional display name.

Accepted artifact URI schemes continue to be governed by TP-0.47:

```text
training-artifact://
workspace://
local-model://
```

Registration always creates/uses an EXPERIMENTAL manifest. It does not infer or fabricate data-governance/security review completion.

## Runtime readiness

Candidate readiness targets the exact registered runtime model on the selected MIO Local backend:

```text
Ollama
vLLM
llama.cpp server
```

The existing loopback-only endpoint enforcement remains authoritative. Candidate Lab does not create a remote inference bypass.

Readiness does not alter `ModelRouter` configuration and does not activate the candidate.

## Tool-free MioBench

Candidate Lab intentionally does **not** benchmark through the MIO Local agent provider.

Instead it creates a narrow `ModelProvider` facade over `LocalInferenceBackend.chat()`.

This means MioBench receives only its benchmark system/user messages and generation controls. The benchmark path contains no:

- web-search tool;
- desktop browser tool;
- research gateway;
- application-context retrieval;
- agent tool envelope;
- tool round retry policy.

The local backend response model identity is preserved. TP-0.47 then requires the returned candidate model identity to match the manifest runtime model exactly before storing benchmark evidence.

## Base-vs-candidate comparison

Comparison is explicitly bounded to the same `MIO_BENCH_CORE` suite.

The user supplies the base runtime alias actually served by the selected local backend. Both base and candidate must pass readiness first.

The Lab records:

- exact base runtime model identity;
- exact candidate runtime model identity;
- backend family;
- complete base MioBench report;
- complete candidate MioBench report;
- candidate benchmark-report binding ID;
- pass-rate metric;
- score-ratio metric;
- average latency;
- candidate-minus-base deltas.

The comparison disclosure explicitly states that these deltas are bounded benchmark evidence, **not** proof of general superiority.

No comparison outcome changes lifecycle automatically.

## Settings UI

`ModelCandidateLabPanel` is placed before the TP-0.48 release-review panel.

Workflow:

```text
IMPORT GOVERNED TRAINING OUTPUT
  ↓
VERIFY IMPORT
  ↓
REGISTER AS EXPERIMENTAL CANDIDATE
  ↓
READINESS
  ↓
MIOBENCH
  ↓
COMPARE BASE VS CANDIDATE (optional)
  ↓
TP-0.48 RELEASE REVIEW
```

The existing `TrainingCandidatePanel` remains the authority for explicit human RC review.

The existing `PromotedModelPanel` remains the authority for activation of already-PROMOTED models.

## Artifact integrity disclosure

TP-0.49 deliberately distinguishes three different claims:

1. **Training bundle integrity verified** — yes, using SHA-256 dataset/config fingerprints and deterministic bundle identity.
2. **Training-result identity binding verified** — yes, against the exact bundle fields and training timestamp contract.
3. **Current adapter bytes on disk verified** — no.

An artifact URI is an identity/scoping reference. Runtime readiness verifies that a local inference backend reports/serves the expected model identity; it does not hash the underlying adapter files.

Byte-level adapter-directory integrity should be implemented as a separate desktop-scoped hashing capability rather than being falsely implied by TP-0.49.

## Regression coverage

`trainingCandidateLabTests.ts` verifies:

- valid governed import preview;
- tampered dataset rejection;
- mismatched training-result fingerprint rejection;
- EXPERIMENTAL-only registration;
- no fabricated governance/security review;
- exact candidate readiness identity;
- MioBench policy-pass persistence;
- exact base/candidate identities in comparisons;
- bounded metric deltas;
- comparison persistence;
- no automatic lifecycle advancement;
- no active promoted-model pointer mutation.

## Security / governance invariants

TP-0.49 must not:

- read arbitrary local files outside user-selected browser files;
- accept non-loopback inference as MIO Local;
- enable tools during candidate benchmarking;
- auto-write RELEASE_CANDIDATE;
- auto-write PROMOTED;
- mutate the active promoted model pointer;
- treat a benchmark delta as an overall quality verdict;
- claim adapter byte integrity without a real file-hashing capability.

## Next candidate hardening milestone

A later desktop-only checkpoint can add a separate governed adapter-integrity capability that hashes an explicitly authorized local adapter directory and binds its directory manifest to the candidate record. That capability should remain distinct from model readiness and lifecycle review.
