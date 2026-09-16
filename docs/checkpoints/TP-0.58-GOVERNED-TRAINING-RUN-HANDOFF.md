# TP-0.58 — Governed Training Run Handoff

## Objective

Close the operational gap between TP-0.46 governed LoRA/QLoRA training output and TP-0.49 Candidate Lab by packaging the verified training bundle plus `mio-training-result.json` into one deterministic, self-verifying handoff artifact that can be imported back into Mio without granting the browser authority to execute Python, run training, trust adapter bytes, promote, activate, upload, or deploy a model.

## Delivered scope

### Portable training-run handoff contract

`src/training/TrainingRunHandoff.ts` defines `MIO_TRAINING_RUN_HANDOFF_V1`.

The handoff embeds:

- the original TP-0.46 `manifest.json` object;
- exact `train.jsonl` bytes;
- the runner-produced `mio-training-result.json`;
- fixed runner metadata binding the handoff to `training/train_mio_lora.py` and TP-0.46;
- dataset SHA-256;
- training-config SHA-256;
- training-result SHA-256;
- deterministic handoff SHA-256;
- an explicit disclosure that the handoff is consistency evidence only.

`handoffSha256` is computed over canonical stable JSON for every field except the digest itself. The same canonicalization is used during verification.

### Shared fail-closed validation

Training-result binding rules were extracted as `validateTrainingResultArtifact(...)` in `TrainingCandidateRegistry` and are reused by both candidate registration and handoff verification.

A handoff is accepted only when:

- its schema/kind/timestamps are valid;
- the embedded TP-0.46 bundle passes the existing `TrainingBundleVerifier`;
- the result remains `TRAINED_NOT_EVALUATED` / `NOT_EVALUATED`;
- bundle ID, dataset hash, config hash, base/target model, training method, example count, and next-gate contract match;
- result time does not predate the training bundle;
- handoff creation does not predate training completion;
- training-result SHA-256 matches;
- dataset/config fingerprints match the embedded manifest;
- deterministic handoff SHA-256 matches.

Any mismatch fails closed.

### Explicit registration service

`TrainingRunHandoffService` verifies the handoff before delegating to `TrainingCandidateRegistry`.

The handoff intentionally does **not** decide:

- runtime model alias;
- adapter/model artifact URI;
- adapter byte integrity;
- benchmark outcome;
- release-candidate review;
- promotion;
- activation.

`runtimeModel` and `artifactUri` remain explicit operator inputs. A successful registration creates only an `EXPERIMENTAL` / `REGISTERED_UNEVALUATED` candidate.

### Settings handoff panel

`TrainingRunHandoffPanel` provides a single-file import flow in Settings:

1. choose `mio-training-handoff.json`;
2. verify all embedded identities and hashes;
3. inspect bundle/result metadata;
4. explicitly provide runtime alias and artifact URI;
5. register the candidate.

The existing three-file Candidate Lab import remains available as a fallback and continues to own readiness, adapter integrity, MioBench, base-vs-candidate comparison, and later review flows.

### Offline handoff packager

`scripts/training/create-training-run-handoff.mjs` packages a verified TP-0.46 bundle directory plus `mio-training-result.json` into a single handoff file.

Properties:

- bounded 64 MiB inputs;
- Node standard library only;
- bundle/result identity verification before packaging;
- deterministic hashes;
- refuses to overwrite an existing output file;
- output mode requested as owner-readable/writable (`0600`) on supported filesystems;
- no Python execution;
- no ML imports;
- no model download;
- no benchmark;
- no promotion/activation;
- no network upload/deployment.

Example:

```bash
node scripts/training/create-training-run-handoff.mjs \
  --bundle ./training-bundle \
  --result ./adapter-output/mio-training-result.json \
  --output ./adapter-output/mio-training-handoff.json
```

Contract-only self-test:

```bash
node scripts/training/create-training-run-handoff.mjs --self-test
```

## Security boundary

TP-0.58 is a transport and consistency layer, not a model-trust shortcut.

The handoff digest proves that the handoff contents have not changed relative to the digest included in that same file. It does **not** independently authenticate who created the handoff and does not prove the bytes of the trained adapter/model artifact. Adapter bytes remain subject to TP-0.50 integrity evidence and TP-0.53+ provenance/signing controls where applicable.

The browser/runtime does not invoke the training process. Training remains an isolated operator-controlled local process.

## Regression coverage

`trainingRunHandoffTests` verifies:

- valid handoff re-verifies the embedded governed bundle;
- training-result SHA-256 is recomputed exactly;
- deterministic handoff SHA-256 is recomputed exactly;
- dataset tampering is rejected;
- training-result binding tampering is rejected;
- handoff digest tampering is rejected;
- registration creates only an unevaluated candidate;
- lifecycle remains `EXPERIMENTAL`;
- registration cannot create an active promoted-model pointer;
- invalid handoffs cannot register.

The Training Runner Contract additionally runs:

```bash
node --check scripts/training/create-training-run-handoff.mjs
node scripts/training/create-training-run-handoff.mjs --self-test
```

alongside the existing Python runner, provenance, audit-bundle, and attestation checks.

## Runtime flow

```text
TP-0.46 governed bundle
  manifest.json + train.jsonl
              │
              ▼
training/train_mio_lora.py
              │
              ├─ adapter/model output
              └─ mio-training-result.json
                         │
                         ▼
create-training-run-handoff.mjs
                         │
                         ▼
             mio-training-handoff.json
                         │
                         ▼
          TrainingRunHandoff verifier
             ├─ bundle SHA/config binding
             ├─ result identity binding
             └─ deterministic handoff digest
                         │
                         ▼
          explicit operator registration
                         │
                         ▼
            EXPERIMENTAL candidate only
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       TP-0.50 integrity      MioBench / comparison
              │                     │
              └──────────┬──────────┘
                         ▼
                   review gates
                         ▼
                 explicit promotion
                         ▼
                  explicit activation
```

## Deferred follow-up

Recommended next checkpoints:

- bind handoff metadata to TP-0.50 adapter integrity evidence so a specific handoff can point to a specific scanned artifact fingerprint;
- optional signed training-run receipt using an offline training authority key;
- GPU/VRAM capacity preflight and local training-run planning;
- deterministic train/eval split as a separate bundle contract;
- governed preference/DPO bundle as a separate format rather than overloading SFT handoff semantics.
