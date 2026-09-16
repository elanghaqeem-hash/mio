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
7. Verify the bundle with `training/train_mio_lora.py --dry-run` or TP-0.62 desktop `DRY_RUN`.
8. Train LoRA/QLoRA in a dedicated Python/GPU environment, optionally through the TP-0.62 governed desktop runner.
9. Package the verified bundle + runner result as a TP-0.58 `mio-training-handoff.json`.
10. Import the handoff into Mio as an `EXPERIMENTAL` / `REGISTERED_UNEVALUATED` candidate.
11. Fingerprint the explicitly authorized local adapter directory with TP-0.50.
12. Explicitly bind the current integrity scan to the TP-0.58 handoff in **Settings → Training Handoff ↔ Adapter Integrity**.
13. Run MioBench and security/tool-boundary regressions.
14. Re-bind if a newer adapter scan is performed before release review or promotion.
15. Complete explicit release review, promotion, post-promotion integrity scan, and activation gates.
16. Export a TP-0.60 portable candidate evidence package whenever an audit/review snapshot is needed. Export is informational only and never changes lifecycle state.
17. When the evidence package must cross a local trust boundary, sign it externally with TP-0.61 and verify it in Mio against the existing trusted P-256 signer store.

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

## Run TP-0.62 from Mio Desktop

Mio Desktop can invoke the same TP-0.46 runner through **Settings → Governed Local Training Runner**. This is a fixed-entrypoint execution capability, not a terminal or generic process launcher.

The desktop flow is:

1. Authorize one local workspace directory through the native directory picker.
2. Enter the governed bundle path relative to that workspace.
3. Run `DRY_RUN` first to verify the bundle.
4. For real training, create an empty output directory inside the authorized workspace but outside the bundle directory.
5. Select only one of the whitelisted launchers: `python`, `python3`, or Windows `py -3`.
6. Choose **START L4 TRAINING** and approve the scoped execution request.
7. Monitor bounded stdout/stderr tails; the Settings panel can recover an active job after navigation/remount.
8. Use **CANCEL** or global **STOP MIO** at any time; cancellation is intentionally available without another execution grant.
9. After success, use the reported `mio-training-result.json` relative path as the result input for TP-0.58 packaging.

Security boundaries:

- the renderer cannot provide a shell string, executable path, script path, arbitrary CLI flag, or arbitrary environment variables;
- Electron chooses the bundled `training/train_mio_lora.py` itself;
- subprocess execution uses `shell: false`;
- the runner receives a minimized environment plus `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, and `HF_DATASETS_OFFLINE=1`;
- the capability declares `networkAccess: false`;
- output must already exist and be empty; `--overwrite` is never exposed;
- output may not be inside the governed bundle directory;
- only one governed training job can run at a time;
- workspace revocation requests cancel an active job first instead of creating a false impression that a running process has lost filesystem authority.

These controls provide application-level offline minimization. They are not an operating-system firewall. For high-assurance isolated training, also isolate the workstation/container at the OS/network layer.

The Electron package carries the fixed runner as an `extraResource`; the Training Runner Contract CI verifies this packaging boundary plus the no-shell/offline markers.

TP-0.62 never creates a candidate or advances a lifecycle. A successful `TRAIN` still ends at `TRAINED_NOT_EVALUATED` and must continue through TP-0.58 handoff, TP-0.50/0.59 integrity binding, MioBench, review, promotion, post-promotion integrity, and activation.

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

## Bind TP-0.58 handoff identity to TP-0.50 adapter bytes

For candidates imported through the governed handoff path, TP-0.59 requires an explicit binding between the verified handoff receipt and the current adapter-integrity scan.

In Mio:

1. Open Candidate Lab and run the explicit TP-0.50 adapter integrity scan against the intended local adapter directory.
2. Open **Training Handoff ↔ Adapter Integrity** in Settings.
3. Confirm the handoff, integrity state, runtime alias, and artifact identity.
4. Choose **BIND CURRENT SCAN**.
5. Continue with MioBench and release review only after the binding state is `CURRENT`.

A later integrity scan intentionally makes the previous current-review binding `STALE`, even when the bytes still match the immutable baseline. Re-bind the latest clean scan before release review or promotion. A `DRIFT` scan cannot be bound.

At promotion, Mio records the binding evidence ID as historical promotion provenance. TP-0.52 still requires a new post-promotion `MATCH` scan before activation; activation separately revalidates the historical promotion binding and the current post-promotion bytes.

TP-0.59 does not replace signed model provenance and does not itself prove origin authenticity, model quality, safety, promotion readiness, or activation safety.

## Export a TP-0.60 portable candidate evidence package

Use **Settings → Portable Candidate Evidence Package** to export a point-in-time audit snapshot for a registered training candidate. Export is allowed at any lifecycle stage so that blocked/experimental candidates can be audited without first making them eligible.

The package contains bounded governance metadata such as:

- candidate + model manifest identity;
- TP-0.58 handoff receipt metadata when present;
- sanitized benchmark summary and SHA-256 of the complete stored benchmark report;
- latest TP-0.50 adapter-integrity evidence;
- latest TP-0.59 handoff↔adapter binding;
- signed provenance evidence + signer trust summary when present;
- exact evidence referenced by structured promotion provenance when applicable;
- release/promotion gate snapshot and blocking reasons;
- deterministic `packageSha256`.

The package deliberately excludes training JSONL, training message content, raw benchmark model output, model weights, adapter bytes, private keys, credentials, authorization/permission grants, and tool secrets. Unknown schema fields and known sensitive field names are rejected even if a package digest is recomputed.

Verify a package independently with Node only:

```bash
node scripts/training/verify-candidate-evidence-package.mjs \
  --input /path/to/mio-candidate-evidence-candidate-id.json
```

Verifier contract self-test:

```bash
node scripts/training/verify-candidate-evidence-package.mjs --self-test
```

A `valid: true` result proves only that the portable package is internally consistent with its packaged evidence and digest contract. It is **not** a quality/safety certification, signer authenticity re-verification against an external root of trust, promotion approval, activation authorization, deployment authorization, or proof that referenced model/adapter bytes are still present locally.

## Sign a TP-0.60 package with TP-0.61

TP-0.61 adds authenticity for evidence exchange without moving a private key into Mio. Use a dedicated external P-256 private key and sign the already-verified TP-0.60 package:

```bash
node scripts/training/sign-candidate-evidence-package.mjs \
  --package /path/to/mio-candidate-evidence.json \
  --private-key /secure/path/candidate-evidence-private.pem \
  --issuer "MIO Release Engineering" \
  --output /path/to/signed-candidate-evidence.json \
  --public-key-output /path/to/candidate-evidence-public.pem
```

The signature payload binds:

- `packageSha256`;
- candidate ID;
- manifest ID;
- lifecycle snapshot;
- package export timestamp;
- issuer;
- signature timestamp.

Only the public key should be imported/trusted through the existing Mio signer-trust workflow. **Never import the private key into Mio, browser storage, repository secrets, or project files.**

Inside Mio, use **Settings → Trusted Signed Candidate Evidence** to verify the signed envelope. Application verification requires:

1. the embedded TP-0.60 package to pass its full schema/privacy/identity verification;
2. payload fields to bind exactly to that package;
3. the P-256 signature to verify;
4. the envelope key ID to match the trusted public key;
5. the signer to be currently `TRUSTED` in the existing signer trust store/audit chain.

Signer revocation therefore causes current Mio verification to fail while leaving the historical envelope unchanged. Explicit re-trust of the same deterministic public-key identity can restore current verification.

For independent cryptographic verification outside Mio:

```bash
node scripts/training/verify-signed-candidate-evidence-package.mjs \
  --input /path/to/signed-candidate-evidence.json \
  --public-key /path/to/candidate-evidence-public.pem
```

The offline verifier proves signature validity only for the supplied public key. It does **not** establish that the supplied key should be trusted; trust must be established independently. Conversely, the Mio application verifier combines cryptographic verification with the current trusted-signer state.

TP-0.61 signing/verification does not train, benchmark, review, promote, activate, upload, publish, or deploy a model and never changes the active promoted-model pointer.

## Compatibility entrypoint

`training/sft_lora.py` remains only as a compatibility shim and delegates to the governed bundle runner. The former raw `--dataset` path is intentionally no longer accepted because it could bypass bundle fingerprints and governance metadata.

## Recommended progression

- `Mio-Local-8B-v0`: untouched base-model baseline.
- `Mio-Local-8B-v0.x`: experimental adapters; never default.
- `Mio-Local-8B-v1-candidate`: freshly trained output; `NOT_EVALUATED`.
- `Mio-Local-8B-v1-rc`: candidate that passes MioBench/security review.
- `Mio-Local-8B-v1`: explicitly promoted model/adapter after documented review.

Model weights, checkpoints, large datasets, training handoff files containing dataset content, candidate evidence packages containing governance metadata, signed candidate evidence envelopes, and user data must not be committed to this repository.
