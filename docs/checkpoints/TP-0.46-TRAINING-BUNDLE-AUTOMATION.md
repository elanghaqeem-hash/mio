# TP-0.46 — Governed Training Bundle Automation

## Objective

Convert MIO's existing governed training-data foundation into a reproducible, auditable handoff for LoRA/QLoRA training without allowing raw chat/project/browser/feedback data to bypass eligibility, provenance, privacy, copyright, quality, benchmark, or promotion controls.

## Delivered scope

### Deterministic training bundle

`src/training/TrainingBundle.ts` builds a bundle only from `isTrainingEligible(...)` examples.

The bundle contains:

- `train.jsonl` — eligible examples only, sorted by `example.id`;
- `manifest.json` — normalized training configuration, excluded-example IDs/reasons, source distributions, and reproducibility fingerprints.

Bundle identity is derived from:

- SHA-256 of exact `train.jsonl` bytes;
- SHA-256 of canonical normalized training config.

`generatedAt` remains audit metadata and does not alter bundle identity.

### Bundle verification

`TrainingBundleVerifier` checks:

- schema/format;
- fixed file contract;
- `NOT_EVALUATED` promotion status;
- exact dataset/config SHA-256;
- derived bundle ID;
- JSONL validity;
- unique ordered example IDs;
- minimum conversational structure ending in an assistant response;
- count consistency for domain/language/provenance.

### Export CLI

`scripts/training/export-training-bundle.ts`:

- accepts reviewed `MioTrainingExample[]` JSON and `MioTrainingRunConfig` JSON;
- never exports ineligible content into training JSONL;
- refuses non-empty output directories unless `--force` is explicit;
- verifies its own output before writing;
- performs no training, upload, promotion, activation, or deployment.

### Isolated LoRA/QLoRA runner

`training/train_mio_lora.py` consumes only a verified bundle.

Safety and reproducibility behavior:

- `--dry-run` verifies the bundle without importing ML libraries or downloading weights;
- `--self-test` uses Python standard library only and includes tamper detection;
- `trust_remote_code=False`;
- QLoRA uses 4-bit NF4 + double quantization and `prepare_model_for_kbit_training`;
- LoRA hyperparameters come from the signed/fingerprinted bundle manifest rather than ad-hoc CLI overrides;
- no model-hub push/upload path exists;
- output status is `TRAINED_NOT_EVALUATED` / `NOT_EVALUATED`;
- next mandatory gate is MioBench + existing `ModelPromotionGate`.

The old `training/sft_lora.py` raw-dataset entrypoint is reduced to a compatibility shim so raw JSONL cannot bypass the TP-0.46 bundle contract.

### Dependency isolation

Python ML dependencies remain in `training/requirements.txt`, separate from the Mio browser/Electron dependency graph.

Pinned TP-0.46 reference stack (2026-09-16):

- PyTorch 2.14.0
- Transformers 5.17.0
- TRL 1.13.0
- PEFT 0.21.0
- Datasets 5.0.1
- Accelerate 1.15.0
- bitsandbytes 0.50.2

### Reference config

`training/configs/mio-local-8b-qlora.json` supplies a conservative Qwen3-8B candidate configuration with:

- deterministic seed;
- QLoRA;
- assistant-only loss;
- bounded sequence length/batch/accumulation;
- required core domains;
- minimum eligible dataset size;
- no automatic promotion.

## Security properties

TP-0.46 does **not**:

- scrape or collect user data;
- convert ordinary memory into training data;
- auto-approve feedback;
- train on browser/search evidence;
- download a model during dry-run/self-test;
- upload weights;
- publish to a model hub;
- promote a candidate;
- activate a candidate in MIO Local;
- deploy infrastructure.

Training and promotion remain separate authority boundaries.

## Validation

Regression coverage verifies:

- only eligible data is exported;
- excluded user-contributed content does not appear in JSONL;
- input ordering does not change dataset bytes or bundle identity;
- timestamps do not change fingerprints;
- missing required domains fail closed;
- duplicate example IDs fail closed;
- out-of-range training config fails closed;
- tampering changes SHA-256 and fails verification;
- bundle status remains `NOT_EVALUATED`.

A dedicated GitHub workflow also:

- compiles both Python entrypoints;
- runs the standard-library runner self-test;
- verifies training dependencies have not leaked into the JS runtime package.

## Runtime flow

```text
Reviewed Training Candidates
        │
        ▼
TrainingDataset eligibility gate
        │
        ▼
TrainingBundle builder
  ├─ train.jsonl
  └─ manifest.json + SHA-256
        │
        ▼
TrainingBundleVerifier
        │
        ▼
train_mio_lora.py --dry-run
        │
        ▼
LoRA / QLoRA isolated training
        │
        ▼
TRAINED_NOT_EVALUATED
        │
        ▼
MioBench + security regression
        │
        ▼
ModelPromotionGate
        │
        ▼
Explicit PROMOTED model activation
```

## Deferred follow-up

Recommended next checkpoint after TP-0.46:

- training run manifest ingestion back into MIO;
- automatic MioBench candidate evaluation without automatic promotion;
- adapter/model identity binding to benchmark reports;
- optional local model registry for candidate artifacts;
- deterministic train/eval split generation;
- DPO/preference dataset bundle as a separate governed format;
- GPU capacity estimator and preflight.
