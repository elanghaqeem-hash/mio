# TP-0.52 — Signed Model Artifact Provenance

## Status

Implementation checkpoint on top of TP-0.50 adapter byte integrity and TP-0.51 explicit final model promotion.

TP-0.52 adds explicit public-key trust and cryptographically signed provenance for governed local model-adapter candidates. It does not train, promote, activate, upload, publish, deploy, or automatically trust a model.

## Separation of evidence

Mio now distinguishes three independent questions:

1. **Byte identity** — TP-0.50: what adapter bytes were observed locally?
2. **Signed provenance** — TP-0.52: did the holder of a particular private key sign this exact candidate/training/artifact identity?
3. **Current trust** — TP-0.52: is the corresponding public key explicitly trusted by Mio now?

A valid signature is not automatically a trusted signature, and a trusted signature is not evidence of model quality.

## Cryptographic contract

- ECDSA P-256 / prime256v1 / secp256r1
- SHA-256
- SubjectPublicKeyInfo public keys
- 64-byte IEEE-P1363 signature format
- stable JSON canonicalization using Mio `stableJsonStringify`
- deterministic key identity: `p256:<SHA-256(SPKI DER)>`

No key embedded in a signed envelope is auto-trusted.

## Trusted signer store

`ModelSignerTrustStore` accepts only explicitly imported P-256 public verification keys.

States:

- `TRUSTED`
- `REVOKED`

Revocation preserves historical evidence. Re-trusting the exact same SPKI key restores the same deterministic key id. Private keys are never accepted or persisted by Mio.

## Provenance payload

`MIO_MODEL_ARTIFACT_PROVENANCE_V1` binds:

- candidate id
- model manifest id
- governed training bundle id
- training-result SHA-256
- training dataset SHA-256
- training config SHA-256
- runtime model alias
- base model
- LoRA/QLoRA method
- artifact URI
- current TP-0.50 artifact fingerprint
- `mio-adapter-tree-v1` canonicalization
- file count and total bytes
- issuer label
- issuance timestamp

Payload preparation requires current non-DRIFT TP-0.50 evidence and a LoRA/QLoRA training candidate.

## Offline private-key boundary

Private signing keys stay outside Mio. The repository provides:

```bash
node scripts/training/sign-model-artifact-provenance.mjs \
  --payload mio-provenance-payload.json \
  --private-key signer-private.pem \
  --output mio-artifact-provenance.json \
  --public-key-output signer-public.pem
```

The utility uses Node built-in cryptography only, validates P-256 key type, derives the public key/key id, signs canonical JSON with P-256/SHA-256, uses exclusive output creation, performs no upload, and has a standard-library-only `--self-test`.

Only the public key should be imported into Mio.

## Verification

`TrainingCandidateProvenanceService.verifyAndBind()` requires:

- registered training candidate;
- current model manifest;
- current non-DRIFT adapter-integrity evidence;
- already TRUSTED signer key;
- exact signer key-id match;
- exact candidate/training/model/artifact binding;
- artifact fingerprint equal to current TP-0.50 evidence;
- valid P-256/SHA-256 signature.

Verified evidence stores identity fields plus canonical payload/envelope SHA-256 fingerprints for audit. No model permission or lifecycle transition is granted by signature verification.

## Release-candidate gate

Signed provenance is backward-compatible when entirely absent.

Once provenance evidence exists, `EXPERIMENTAL -> RELEASE_CANDIDATE` revalidates:

- candidate/manifest binding;
- runtime-model binding;
- artifact URI;
- training-result SHA-256;
- current adapter integrity;
- provenance artifact fingerprint vs current integrity fingerprint;
- signer presence and TRUSTED state;
- signer key identity;
- stored verification-hash contract.

A revoked or inconsistent signer blocks release review.

## Final promotion gate

TP-0.52 also integrates with TP-0.51 final promotion so there is no trust gap after release review.

For `RELEASE_CANDIDATE -> PROMOTED`, Mio revalidates the same current provenance/signature trust evidence in addition to existing benchmark, governance/security, candidate binding, and byte-integrity checks.

Therefore:

- signer trusted at RC but revoked later -> final promotion is blocked;
- explicit re-trust of the same public key -> promotion eligibility may return if all other gates remain valid;
- re-trust never promotes automatically;
- promotion never activates automatically.

The promotion audit note records the provenance evidence id and signer trust state used at final promotion when provenance exists.

## UI

Settings exposes **SIGNED MODEL ARTIFACT PROVENANCE** before release review:

- import/trust a P-256 public key;
- inspect TRUSTED/REVOKED signer state;
- explicitly revoke a signer;
- prepare a candidate-bound signing payload;
- import and verify a signed envelope;
- inspect current integrity/provenance state.

Release Review and Final Model Promotion both display provenance/signing status when available and surface blocking reasons instead of bypassing invalid evidence.

## CI and tests

`MIO Training Runner Contract` now validates:

```bash
node --check scripts/training/sign-model-artifact-provenance.mjs
node scripts/training/sign-model-artifact-provenance.mjs --self-test
```

Regression coverage includes:

- P-256 public-key validation;
- deterministic key identity;
- exact signing-payload binding;
- trusted signature verification;
- payload tamper rejection;
- wrong artifact fingerprint rejection even with a valid signature;
- cryptographically valid but untrusted signer rejection;
- signer revocation and explicit re-trust;
- release-review blocking after revocation;
- final-promotion blocking when signer is revoked after RC;
- no automatic lifecycle advancement;
- no automatic active-model pointer changes.

## Remaining boundary

TP-0.52 is not hardware-backed key custody, a certificate PKI, transparency log, timestamping authority, Sigstore integration, or remote trust federation.

A later policy checkpoint can decide whether provenance is optional or mandatory at specific lifecycle stages without changing the cryptographic verifier itself.
