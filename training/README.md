# MIO Local Training

This folder contains offline adapter-training tooling for MIO Local. It is intentionally isolated from the application runtime: installing or running Mio does **not** install PyTorch, Transformers, TRL, PEFT, Datasets, Accelerate, or bitsandbytes.

## Governance first

Do not point a trainer directly at chat history, project files, browser/search evidence, feedback storage, or arbitrary JSONL.

The required governed flow is:

1. Create/import candidate examples in the `MioTrainingExample` schema.
2. Preserve provenance for every example.
3. Complete privacy and copyright review.
4. Score factuality, instruction-following, safety, and tool-use where applicable.
5. Set `trainingApproved` only after controlled review.
6. Export a governed TP-0.46 bundle with `npm run training:export`.
7. Verify the bundle with `training/train_mio_lora.py --dry-run`.
8. Train LoRA/QLoRA in a dedicated Python/GPU environment.
9. Package the verified bundle + runner result as a TP-0.58 `mio-training-handoff.json`.
10. Import the handoff into Mio as an `EXPERIMENTAL` / `REGISTERED_UNEVALUATED` candidate.
11. Fingerprint/verify the local adapter artifact, run MioBench, and run security/tool-boundary regressions.
12. Complete explicit review and `ModelPromotionGate` before activation.

User feedback is opt-in and never becomes trainable merely because it was stored. `FeedbackCollector.toTrainingCandidate()` deliberately creates an unapproved candidate requiring further review.

## Training bundle

TP-0.46 uses a two-file bundle:

```text
bundle/
├── train.jsonl
└── manifest.json
```

The manifest contains the normalized training config, eligible/excluded counts, domain/language/provenance distribution, ordered eligible example IDs, SHA-256 of the exact training JSONL, SHA-256 of the canonical config, and `promotionStatus: NOT_EVALUATED`.

A bundle is deterministic for the same eligible examples and normalized config. `generatedAt` is audit metadata and does not influence the bundle ID or content fingerprints.

## Export a bundle

Input `examples.json` must be a JSON array of `MioTrainingExample` objects. Only examples for which `isTrainingEligible(...)` is true are written to `train.jsonl`; ineligible records are represented only by ID + exclusion reasons in the manifest.

```bash
npm run training:export -- \
  --examples /path/to/examples.json \
  --config training/configs/mio-local-8b-qlora.json \
  --output training/output/mio-local-8b-v1-bundle
```

The exporter refuses to overwrite a non-empty directory unless `--force` is explicitly supplied. It does not train, upload, promote, activate, or deploy a model.

## Verify without ML dependencies

```bash
python training/train_mio_lora.py \
  --bundle training/output/mio-local-8b-v1-bundle \
  --dry-run
```

Dry-run verifies schema, fixed file names, promotion state, SHA-256 dataset fingerprint, canonical config fingerprint, bundle ID, example count/order, uniqueness, final assistant message, and required-domain coverage. It does not import ML packages or download model weights.

A standard-library-only runner self-test is also available:

```bash
python training/train_mio_lora.py --self-test
```

## Environment for real training

Create a dedicated Python environment on a suitable training workstation/server:

```bash
python -m venv .venv-training
source .venv-training/bin/activate   # Windows: .venv-training\Scripts\activate
python -m pip install --upgrade pip
pip install -r training/requirements.txt
```

`training/requirements.txt` is intentionally separate from the desktop/web dependencies and is pinned to the TP-0.46 validated stack.

## Train a candidate

```bash
python training/train_mio_lora.py \
  --bundle training/output/mio-local-8b-v1-bundle \
  --output training/output/mio-local-8b-v1-adapter
```

For `QLORA`, the runner uses 4-bit NF4 with double quantization and prepares the quantized model for k-bit training. If no explicit target-module list is supplied, QLoRA defaults to PEFT `all-linear`. LoRA/QLoRA hyperparameters come only from the verified manifest, not ad-hoc CLI overrides.

The runner disables `trust_remote_code`, does not push to a model hub, and writes a local `mio-training-result.json` with:

```text
status: TRAINED_NOT_EVALUATED
promotionStatus: NOT_EVALUATED
nextRequiredGate: MioBench + ModelPromotionGate
```

Training completion is therefore not a promotion signal.

## Package a TP-0.58 training-run handoff

After training completes, package the exact governed bundle and its runner result into one portable handoff file:

```bash
node scripts/training/create-training-run-handoff.mjs \
  --bundle training/output/mio-local-8b-v1-bundle \
  --result training/output/mio-local-8b-v1-adapter/mio-training-result.json \
  --output training/output/mio-local-8b-v1-adapter/mio-training-handoff.json
```

The packager re-verifies bundle/result identity before writing. It refuses to overwrite an existing handoff and performs no model loading, training, benchmark, network upload, promotion, activation, or deployment.

Contract-only self-test:

```bash
node scripts/training/create-training-run-handoff.mjs --self-test
```

The resulting handoff can be imported from **Settings → Governed Training Run Handoff**. Mio still requires explicit runtime alias and artifact URI. Handoff verification does not prove the adapter/model bytes; TP-0.50 integrity scanning and later provenance/review/promotion gates remain mandatory.

## Compatibility entrypoint

`training/sft_lora.py` remains only as a compatibility shim and delegates to the governed bundle runner. The former raw `--dataset` path is intentionally no longer accepted because it could bypass bundle fingerprints and governance metadata.

## Recommended progression

- `Mio-Local-8B-v0`: untouched base-model baseline.
- `Mio-Local-8B-v0.x`: experimental adapters; never default.
- `Mio-Local-8B-v1-candidate`: freshly trained output; `NOT_EVALUATED`.
- `Mio-Local-8B-v1-rc`: candidate that passes MioBench/security review.
- `Mio-Local-8B-v1`: explicitly promoted model/adapter after documented review.

Model weights, checkpoints, large datasets, training handoff files containing dataset content, and user data must not be committed to this repository.
